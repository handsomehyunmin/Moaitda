import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main
from database.repositories import chats


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db_patch = patch("database.database.DB_PATH", Path(self.directory.name) / "test.db")
        self.db_patch.start()
        self.client = TestClient(main.app)
        self.client.__enter__()
        self.tokens = {}
        for name in ("alice", "bob", "outsider"):
            response = self.client.post("/signup", json={
                "username": name + "@example.com", "password": "password123", "nickname": name,
            })
            self.assertEqual(response.status_code, 200, response.text)
            self.tokens[name] = response.json()["token"]
        self.client.post("/friends", headers=self.headers("alice"), json={"email": "bob@example.com"})
        requests = self.client.get("/friends/requests", headers=self.headers("bob")).json()
        result = self.client.post(f"/friends/requests/{requests[0]['id']}/accept", headers=self.headers("bob"))
        self.assertEqual(result.status_code, 200)

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.sessions.clear()
        main.chat_connections.clear()
        main.notification_connections.clear()
        self.db_patch.stop()
        self.directory.cleanup()

    def headers(self, name):
        return {"Authorization": "Bearer " + self.tokens[name]}

    def socket_url(self, name, friend):
        return f"/ws/chat?token={self.tokens[name]}&with_user={friend}@example.com"

    def test_two_way_delivery_and_history_after_reopen(self):
        with self.client.websocket_connect(self.socket_url("alice", "bob")) as alice:
            with self.client.websocket_connect(self.socket_url("bob", "alice")) as bob:
                alice.send_json({"content": "hello", "clientMessageId": "first"})
                sent = alice.receive_json()["message"]
                self.assertEqual(sent, bob.receive_json()["message"])
                self.assertEqual(sent["clientMessageId"], "first")
                bob.send_json({"content": "reply"})
                self.assertEqual(alice.receive_json(), bob.receive_json())
        with TestClient(main.app) as reopened:
            history = reopened.get("/friends/bob@example.com/messages", headers=self.headers("alice")).json()
        self.assertEqual([item["content"] for item in history], ["hello", "reply"])

    def test_missing_messages_paginate_in_order(self):
        for index in range(205):
            chats.save_message("alice@example.com", "bob@example.com", str(index))
        cursor = 0
        messages = []
        while True:
            page = self.client.get(f"/friends/bob@example.com/messages?after_id={cursor}", headers=self.headers("alice")).json()
            messages.extend(page)
            if len(page) < 100:
                break
            cursor = page[-1]["id"]
        self.assertEqual([item["content"] for item in messages], [str(i) for i in range(205)])
        recent = self.client.get("/friends/bob@example.com/messages", headers=self.headers("alice")).json()
        self.assertEqual(len(recent), 100)
        self.assertEqual(recent[0]["content"], "105")

    def test_permissions_and_invalid_payloads(self):
        self.assertEqual(self.client.get("/friends/bob@example.com/messages").status_code, 401)
        self.assertEqual(self.client.get("/friends/bob@example.com/messages", headers=self.headers("outsider")).status_code, 404)
        with self.assertRaises(WebSocketDisconnect) as rejected:
            with self.client.websocket_connect(self.socket_url("outsider", "bob")) as socket:
                socket.receive_json()
        self.assertEqual(rejected.exception.code, 4403)
        with self.assertRaises(WebSocketDisconnect) as expired:
            with self.client.websocket_connect("/ws/chat?token=invalid&with_user=bob@example.com") as socket:
                socket.receive_json()
        self.assertEqual(expired.exception.code, 4401)
        with self.client.websocket_connect(self.socket_url("alice", "bob")) as socket:
            for payload in ("", "x" * 1001, None):
                socket.send_json({"content": payload})
                self.assertEqual(socket.receive_json()["type"], "error")
            socket.send_text("invalid json")
            self.assertEqual(socket.receive_json()["type"], "error")
            socket.send_json({"content": "still connected"})
            self.assertEqual(socket.receive_json()["message"]["content"], "still connected")

    def test_notifications_unread_and_persisted_receipts(self):
        with self.client.websocket_connect(f"/ws/notifications?token={self.tokens['bob']}") as notifications:
            with self.client.websocket_connect(self.socket_url("alice", "bob")) as alice:
                alice.send_json({"content": "outside chat"})
                message = alice.receive_json()["message"]
                self.assertEqual(notifications.receive_json()["message"], message)
                self.assertEqual(self.client.get("/chats/unread", headers=self.headers("bob")).json(), {"alice@example.com": 1})
                later = chats.save_message("alice@example.com", "bob@example.com", "not displayed yet")
                result = self.client.post(f"/friends/alice@example.com/read?through_id={message['id']}", headers=self.headers("bob"))
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(alice.receive_json(), notifications.receive_json())
                self.assertEqual(self.client.get("/chats/unread", headers=self.headers("bob")).json(), {"alice@example.com": 1})
                self.assertEqual(self.client.get("/chats/unread", headers=self.headers("alice")).json(), {})
                history = self.client.get("/friends/bob@example.com/messages", headers=self.headers("alice")).json()
                self.assertTrue(history[0]["readAt"])
                self.assertIsNone(history[1]["readAt"])
                self.client.post(f"/friends/alice@example.com/read?through_id={later['id']}", headers=self.headers("bob"))
                alice.receive_json()
                notifications.receive_json()
        with TestClient(main.app) as reopened:
            self.assertEqual(reopened.get("/chats/unread", headers=self.headers("bob")).json(), {})
            history = reopened.get("/friends/bob@example.com/messages", headers=self.headers("alice")).json()
            self.assertTrue(all(item["readAt"] for item in history))

    def test_read_and_notification_permissions(self):
        self.assertEqual(self.client.get("/chats/unread").status_code, 401)
        message = chats.save_message("alice@example.com", "bob@example.com", "private")
        result = self.client.post(f"/friends/alice@example.com/read?through_id={message['id']}", headers=self.headers("outsider"))
        self.assertEqual(result.status_code, 404)
        self.assertEqual(self.client.get("/chats/unread", headers=self.headers("bob")).json(), {"alice@example.com": 1})
        with self.assertRaises(WebSocketDisconnect) as rejected:
            with self.client.websocket_connect("/ws/notifications?token=invalid") as socket:
                socket.receive_json()
        self.assertEqual(rejected.exception.code, 4401)


if __name__ == "__main__":
    unittest.main()
