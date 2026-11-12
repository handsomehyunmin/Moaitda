import { API_BASE } from "./config.js";
import { state } from "./state.js";
import { apiRequest } from "./api.js";
import { clearSession } from "./session.js";
import { showScreen } from "./ui.js";

let activeFriend = null;
let socket = null;
let reconnectTimer = null;
let messageIds = new Set();
let chatVersion = 0;
let lastMessageId = 0;
let historyLoaded = false;
let pendingMessage = null;
let incomingThrough = 0;
let readThrough = 0;
let readConfirmed = 0;
let reading = false;

const $ = (selector) => document.querySelector(selector);

function setHomeSections(showChat) {
  ["#homeWelcome", "#pageHeading", ".page-toolbar", "#postFeed", "#emptyState"].forEach((selector) => {
    $(selector)?.classList.toggle("hidden", showChat);
  });
  $("#friendsPanel")?.classList.toggle("hidden", showChat);
  $("#friendChatPanel")?.classList.toggle("hidden", !showChat);
}

function closeConnection() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  pendingMessage = null;
  $("#chatInput")?.removeAttribute("disabled");
  if (socket) {
    const previous = socket;
    socket = null;
    previous.onclose = null;
    previous.close();
  }
  $("#chatSendBtn")?.setAttribute("disabled", "");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function appendMessage(message) {
  if (!message) return;
  if (messageIds.has(String(message.id))) {
    if (message.readAt) {
      const receipt = $("#chatMessages [data-message-id='" + Number(message.id) + "'] .chat-read");
      if (receipt) receipt.textContent = "읽음";
    }
    return;
  }
  messageIds.add(String(message.id));

  const mine = message.senderEmail?.toLowerCase() === state.currentUser?.email?.toLowerCase();
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble" + (mine ? " mine" : "");
  bubble.textContent = message.content || "";
  const time = document.createElement("time");
  time.className = "chat-time";
  time.dateTime = message.createdAt || "";
  time.textContent = formatTime(message.createdAt);
  bubble.append(time);
  if (mine) {
    const receipt = document.createElement("span");
    receipt.className = "chat-read";
    receipt.textContent = message.readAt || Number(message.id) <= readThrough ? "읽음" : "안 읽음";
    bubble.append(receipt);
  } else {
    incomingThrough = Math.max(incomingThrough, Number(message.id));
  }
  bubble.dataset.messageId = String(message.id);
  const container = $("#chatMessages");
  const next = [...(container?.children || [])].find((item) => Number(item.dataset.messageId) > Number(message.id));
  if (next) container.insertBefore(bubble, next);
  else container?.append(bubble);
  $("#chatEmptyState")?.classList.add("hidden");
  if (container) container.scrollTop = container.scrollHeight;
}

function isChatVisible(email = activeFriend?.email) {
  return Boolean(activeFriend && email?.toLowerCase() === activeFriend.email.toLowerCase()
    && !document.hidden && document.hasFocus()
    && !$("#homeScreen")?.classList.contains("hidden")
    && !$("#friendChatPanel")?.classList.contains("hidden"));
}

function applyReceipt(event) {
  if (!activeFriend || event.readerEmail?.toLowerCase() !== activeFriend.email.toLowerCase()
      || event.senderEmail?.toLowerCase() !== state.currentUser?.email?.toLowerCase()) return;
  readThrough = Math.max(readThrough, event.throughId);
  document.querySelectorAll("#chatMessages .mine").forEach((bubble) => {
    if (Number(bubble.dataset.messageId) <= readThrough) bubble.querySelector(".chat-read").textContent = "읽음";
  });
}

async function markVisibleRead() {
  if (!historyLoaded || reading || !isChatVisible() || incomingThrough <= readConfirmed) return;
  const version = chatVersion;
  const through = incomingThrough;
  reading = true;
  let succeeded = false;
  try {
    await apiRequest("/friends/" + encodeURIComponent(activeFriend.email) + "/read?through_id=" + through, { method: "POST" });
    if (version !== chatVersion) return;
    readConfirmed = through;
    succeeded = true;
    document.dispatchEvent(new Event("chat:counts-refresh"));
  } catch {
    // Focus and subsequent messages retry a failed read update.
  } finally {
    if (version === chatVersion) {
      reading = false;
      if (succeeded && incomingThrough > readConfirmed) markVisibleRead();
    }
  }
}

function updateStatus(text) {
  const status = $("#chatConnectionStatus");
  if (status) status.textContent = text;
}

async function syncHistory(current, version) {
  const email = activeFriend.email;
  // Keep a separate cursor so live messages cannot skip a page of missed messages.
  let cursor = historyLoaded ? lastMessageId : null;
  while (socket === current && version === chatVersion) {
    const query = cursor === null ? "" : "?after_id=" + cursor;
    const history = await apiRequest("/friends/" + encodeURIComponent(email) + "/messages" + query);
    if (socket !== current || version !== chatVersion) return;
    history.forEach(appendMessage);
    if (history.length) cursor = Number(history[history.length - 1].id);
    if (history.length < 100 || query === "") {
      if (query !== "") {
        const recent = await apiRequest("/friends/" + encodeURIComponent(email) + "/messages");
        if (socket !== current || version !== chatVersion) return;
        recent.forEach(appendMessage);
      }
      lastMessageId = Math.max(lastMessageId, cursor || 0);
      historyLoaded = true;
      markVisibleRead();
      return;
    }
  }
}

function connect() {
  if (!activeFriend || !state.sessionToken) return;
  closeConnection();
  const socketUrl = new URL("/ws/chat", API_BASE);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  socketUrl.searchParams.set("token", state.sessionToken);
  socketUrl.searchParams.set("with_user", activeFriend.email);

  const current = new WebSocket(socketUrl);
  socket = current;
  const version = chatVersion;
  updateStatus("연결 중...");
  current.addEventListener("open", async () => {
    if (socket !== current) return;
    try {
      await syncHistory(current, version);
      if (socket !== current || version !== chatVersion) return;
      updateStatus("실시간 대화 중");
      $("#chatSendBtn")?.removeAttribute("disabled");
    } catch (error) {
      if (socket !== current) return;
      updateStatus(error.message);
      current.close();
    }
  });
  current.addEventListener("message", (event) => {
    if (socket !== current) return;
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === "message") {
      appendMessage(payload.message);
      markVisibleRead();
      if (pendingMessage && payload.message?.clientMessageId === pendingMessage.id) {
        $("#chatInput").value = "";
        pendingMessage = null;
        $("#chatInput")?.removeAttribute("disabled");
        $("#chatSendBtn")?.removeAttribute("disabled");
        $("#chatInput")?.focus();
      }
    }
    if (payload.type === "read") applyReceipt(payload);
    if (payload.type === "error") {
      pendingMessage = null;
      $("#chatInput")?.removeAttribute("disabled");
      $("#chatSendBtn")?.removeAttribute("disabled");
      updateStatus(payload.message || "메시지를 보내지 못했어요.");
    }
  });
  current.addEventListener("close", (event) => {
    if (socket !== current || !activeFriend) return;
    socket = null;
    pendingMessage = null;
    $("#chatInput")?.removeAttribute("disabled");
    $("#chatSendBtn")?.setAttribute("disabled", "");
    if (event.code === 4401) {
      clearSession();
      showScreen("loginScreen");
      return;
    }
    if (event.code === 4403) {
      updateStatus("친구와의 대화를 이용할 수 없습니다.");
      return;
    }
    updateStatus("연결이 끊겨 다시 연결 중...");
    reconnectTimer = setTimeout(connect, 2000);
  });
  current.addEventListener("error", () => {
    if (socket === current) updateStatus("서버 연결 상태를 확인하고 있어요.");
  });
}

function openChat(email, nickname) {
  if (!email) return;
  closeConnection();
  activeFriend = { email, nickname: nickname || email };
  chatVersion += 1;
  incomingThrough = 0;
  readThrough = 0;
  readConfirmed = 0;
  reading = false;
  lastMessageId = 0;
  historyLoaded = false;
  messageIds = new Set();
  $("#chatMessages")?.replaceChildren();
  $("#chatEmptyState")?.classList.remove("hidden");
  $("#chatFriendName").textContent = activeFriend.nickname;
  $("#chatFriendAvatar").textContent = activeFriend.nickname.slice(0, 1).toUpperCase();
  $("#chatInput").value = "";
  setHomeSections(true);
  $("#chatInput")?.focus();

  connect();
}

export function initFriendChat() {
  document.addEventListener("chat:open", (event) => openChat(event.detail.email, event.detail.nickname));
  document.addEventListener("chat:read", (event) => applyReceipt(event.detail));
  document.addEventListener("chat:incoming", (event) => {
    const message = event.detail.message;
    if (message.senderEmail?.toLowerCase() !== activeFriend?.email.toLowerCase()) return;
    appendMessage(message);
    event.detail.visible = isChatVisible(message.senderEmail);
    markVisibleRead();
  });
  document.addEventListener("visibilitychange", markVisibleRead);
  window.addEventListener("focus", markVisibleRead);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-email]");
    if (button) openChat(button.dataset.chatEmail, button.dataset.chatNickname);
  });

  $("#chatBackBtn")?.addEventListener("click", () => {
    chatVersion += 1;
    activeFriend = null;
    closeConnection();
    setHomeSections(false);
    $("#friendsPanel")?.classList.remove("hidden");
    $("#friendList")?.classList.remove("hidden");
    $("#pendingFriendsPanel")?.classList.add("hidden");
  });

  $("#chatForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#chatInput");
    const content = input?.value.trim();
    if (!content || content.length > 1000 || pendingMessage || $("#chatSendBtn")?.disabled || !socket || socket.readyState !== WebSocket.OPEN) return;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    try {
      socket.send(JSON.stringify({ content, clientMessageId: id }));
      pendingMessage = { id };
      input.disabled = true;
      $("#chatSendBtn")?.setAttribute("disabled", "");
    } catch {
      updateStatus("메시지를 보내지 못했어요. 다시 시도해주세요.");
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".side-link[data-filter]")) return;
    chatVersion += 1;
    activeFriend = null;
    closeConnection();
  });

  document.addEventListener("friends:open", () => {
    chatVersion += 1;
    activeFriend = null;
    closeConnection();
    $("#friendChatPanel")?.classList.add("hidden");
  });

  document.addEventListener("session:cleared", () => {
    activeFriend = null;
    chatVersion += 1;
    closeConnection();
    messageIds.clear();
    lastMessageId = 0;
    historyLoaded = false;
    $("#chatMessages")?.replaceChildren();
    if ($("#chatInput")) $("#chatInput").value = "";
    $("#friendChatPanel")?.classList.add("hidden");
  });
}
