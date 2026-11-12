"""Run with backend/venv/Scripts/python.exe -B backend/tests/browser_chat.py."""
import functools
import socket
import sys
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
import uvicorn
from playwright.sync_api import expect, sync_playwright
import main


def run():
    frontend = Path(__file__).resolve().parents[2] / "frontend"
    with tempfile.TemporaryDirectory() as directory, patch("database.database.DB_PATH", Path(directory) / "browser.db"):
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        api = f"http://127.0.0.1:{listener.getsockname()[1]}"
        server = uvicorn.Server(uvicorn.Config(main.app, log_level="error"))
        api_thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        api_thread.start()
        web = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(SimpleHTTPRequestHandler, directory=str(frontend)))
        threading.Thread(target=web.serve_forever, daemon=True).start()
        try:
            deadline = time.monotonic() + 10
            while not server.started:
                if time.monotonic() > deadline:
                    raise RuntimeError("Test API did not start")
                time.sleep(.05)
            with httpx.Client(base_url=api) as client:
                accounts = {}
                for name in ("alice", "bob"):
                    result = client.post("/signup", json={"username": name + "@example.com", "password": "password123", "nickname": name})
                    result.raise_for_status()
                    accounts[name] = result.json()
                headers = lambda name: {"Authorization": "Bearer " + accounts[name]["token"]}
                client.post("/friends", headers=headers("alice"), json={"email": "bob@example.com"}).raise_for_status()
                request = client.get("/friends/requests", headers=headers("bob")).json()[0]
                client.post(f"/friends/requests/{request['id']}/accept", headers=headers("bob")).raise_for_status()
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True)
                    errors = []
                    pages = {}
                    for name in accounts:
                        context = browser.new_context()
                        context.route("**/js/config.js", lambda route: route.fulfill(content_type="text/javascript", body=f'export const API_BASE = "{api}"; export const SESSION_KEY = "together.session.v1";'))
                        page = context.new_page()
                        page.on("pageerror", lambda error: errors.append(str(error)))
                        page.add_init_script("""sessionStorage.setItem('together.session.v1', JSON.stringify(%s));""" % __import__("json").dumps({"token": accounts[name]["token"], "user": {"email": accounts[name]["username"], "nickname": name}}))
                        page.goto(f"http://127.0.0.1:{web.server_port}/index.html")
                        expect(page.locator("#homeScreen")).to_be_visible()
                        pages[name] = page
                    alice, bob = pages["alice"], pages["bob"]
                    expect(alice.locator("#showChatsBtn")).to_be_visible()
                    alice.locator("#showChatsBtn").click()
                    expect(alice.locator("#friendsTitle")).to_have_text("실시간 대화")
                    expect(alice.locator("[data-chat-email='bob@example.com']")).to_have_text("대화하기")
                    alice.locator("[data-chat-email='bob@example.com']").click()
                    expect(alice.locator("#chatSendBtn")).to_be_enabled()
                    alice.locator("#chatInput").fill("browser hello")
                    alice.locator("#chatSendBtn").click()
                    expect(alice.locator("#chatInput")).to_have_value("")
                    expect(alice.locator(".chat-read")).to_have_text("안 읽음")
                    expect(bob.locator("#chatUnreadTotal")).to_have_text("1")
                    expect(bob.locator("#chatNotification")).to_be_visible()
                    bob.locator("#showFriendsBtn").click()
                    expect(bob.locator("[data-unread-email='alice@example.com']")).to_have_text("1")
                    bob.bring_to_front()
                    bob.locator("#chatNotificationOpen").click()
                    expect(bob.locator("#chatMessages")).to_contain_text("browser hello")
                    expect(bob.locator("#chatSendBtn")).to_be_enabled()
                    expect(alice.locator(".chat-read")).to_have_text("읽음")
                    expect(bob.locator("#chatUnreadTotal")).to_be_hidden()
                    bob.locator("#chatInput").fill("browser reply")
                    bob.locator("#chatSendBtn").click()
                    expect(alice.locator("#chatMessages")).to_contain_text("browser reply")
                    alice.reload()
                    alice.locator("#showFriendsBtn").click()
                    alice.locator("[data-chat-email='bob@example.com']").click()
                    expect(alice.locator("#chatMessages .chat-bubble")).to_have_count(2)
                    expect(alice.locator(".chat-read")).to_have_text("읽음")
                    alice.evaluate("""async () => { const {clearSession} = await import('./js/session.js'); clearSession(); }""")
                    expect(alice.locator("#chatMessages .chat-bubble")).to_have_count(0)
                    expect(alice.locator("#chatNotification")).to_be_hidden()
                    assert not errors, errors
                    browser.close()
                    print("PASS: browser two-account delivery, badges, notification navigation, read receipts, reload history, logout cleanup; no JavaScript errors")
        finally:
            web.shutdown()
            web.server_close()
            server.should_exit = True
            api_thread.join(timeout=10)
            listener.close()


if __name__ == "__main__":
    run()
