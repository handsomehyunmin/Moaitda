import { API_BASE } from "./config.js";
import { state } from "./state.js";
import { apiRequest } from "./api.js";
import { clearSession } from "./session.js";
import { showScreen } from "./ui.js";

let connection = null;
let retryTimer = null;
let counts = {};
let requestVersion = 0;
let notice = null;
const originalTitle = document.title;
const $ = (selector) => document.querySelector(selector);

function renderCounts() {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const badge = $("#chatUnreadTotal");
  if (badge) {
    badge.textContent = total > 99 ? "99+" : String(total);
    badge.classList.toggle("hidden", total === 0);
    badge.setAttribute("aria-label", `안 읽은 메시지 ${total}개`);
  }
  document.querySelectorAll("[data-unread-email]").forEach((element) => {
    const count = counts[element.dataset.unreadEmail] || 0;
    element.textContent = count > 99 ? "99+" : String(count);
    element.classList.toggle("hidden", count === 0);
    element.setAttribute("aria-label", `안 읽은 메시지 ${count}개`);
  });
  document.title = total ? `(${total}) ${originalTitle}` : originalTitle;
}

async function refreshCounts() {
  const token = state.sessionToken;
  const version = ++requestVersion;
  if (!token) return;
  try {
    const result = await apiRequest("/chats/unread");
    if (token !== state.sessionToken || version !== requestVersion) return;
    counts = result;
    renderCounts();
  } catch {
    // Reconnect and returning to the tab both refresh the persisted counts.
  }
}

function stop() {
  clearTimeout(retryTimer);
  retryTimer = null;
  const previous = connection;
  connection = null;
  previous?.close();
}

function connect() {
  stop();
  if (!state.sessionToken) return;
  const url = new URL("/ws/notifications", API_BASE);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", state.sessionToken);
  const current = new WebSocket(url);
  connection = current;
  current.addEventListener("open", () => {
    if (connection === current) refreshCounts();
  });
  current.addEventListener("message", (event) => {
    if (connection !== current) return;
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (payload.type === "message") {
      const message = payload.message;
      if (message?.receiverEmail?.toLowerCase() === state.currentUser?.email?.toLowerCase()) {
        // The active chat listener marks this object when the message is visible.
        const detail = { message, visible: false };
        document.dispatchEvent(new CustomEvent("chat:incoming", { detail }));
        if (!detail.visible) {
          notice = message;
          $("#chatNotificationOpen").textContent = `${message.senderNickname}: ${message.content.slice(0, 80)}`;
          $("#chatNotification").classList.remove("hidden");
        }
      }
    }
    if (payload.type === "read") {
      document.dispatchEvent(new CustomEvent("chat:read", { detail: payload }));
      if (notice && payload.readerEmail?.toLowerCase() === state.currentUser?.email?.toLowerCase()
          && payload.senderEmail === notice.senderEmail && payload.throughId >= notice.id) {
        notice = null;
        $("#chatNotification")?.classList.add("hidden");
      }
    }
    refreshCounts();
  });
  current.addEventListener("close", (event) => {
    if (connection !== current) return;
    connection = null;
    if (event.code === 4401) {
      clearSession();
      showScreen("loginScreen");
    } else if (state.sessionToken) {
      retryTimer = setTimeout(connect, 2000);
    }
  });
}

export function initChatNotifications() {
  document.addEventListener("session:ready", connect);
  document.addEventListener("chat:friends-rendered", renderCounts);
  document.addEventListener("chat:counts-refresh", refreshCounts);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.sessionToken) refreshCounts();
  });
  document.addEventListener("session:cleared", () => {
    stop();
    requestVersion += 1;
    counts = {};
    notice = null;
    renderCounts();
    $("#chatNotification")?.classList.add("hidden");
  });
  $("#chatNotificationDismiss")?.addEventListener("click", () => {
    notice = null;
    $("#chatNotification")?.classList.add("hidden");
  });
  $("#chatNotificationOpen")?.addEventListener("click", () => {
    if (!notice) return;
    document.dispatchEvent(new CustomEvent("chat:open", { detail: {
      email: notice.senderEmail, nickname: notice.senderNickname,
    } }));
    notice = null;
    $("#chatNotification")?.classList.add("hidden");
  });
}
