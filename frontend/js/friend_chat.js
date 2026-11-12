import { API_BASE } from "./config.js";
import { state } from "./state.js";
import { apiRequest } from "./friend.js?v=friend-chat-20261112";

let activeFriend = null;
let socket = null;
let reconnectTimer = null;
let messageIds = new Set();

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
  if (!message || messageIds.has(String(message.id))) return;
  messageIds.add(String(message.id));

  const mine = message.senderEmail === state.currentUser?.email;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble" + (mine ? " mine" : "");
  bubble.textContent = message.content || "";
  const time = document.createElement("time");
  time.className = "chat-time";
  time.dateTime = message.createdAt || "";
  time.textContent = formatTime(message.createdAt);
  bubble.append(time);
  bubble.dataset.messageId = String(message.id);
  const container = $("#chatMessages");
  const next = [...(container?.children || [])].find((item) => Number(item.dataset.messageId) > Number(message.id));
  if (next) container.insertBefore(bubble, next);
  else container?.append(bubble);
  $("#chatEmptyState")?.classList.add("hidden");
  if (container) container.scrollTop = container.scrollHeight;
}

function updateStatus(text) {
  const status = $("#chatConnectionStatus");
  if (status) status.textContent = text;
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
  updateStatus("연결 중...");
  current.addEventListener("open", () => {
    if (socket !== current) return;
    updateStatus("실시간 대화 중");
    $("#chatSendBtn")?.removeAttribute("disabled");
  });
  current.addEventListener("message", (event) => {
    if (socket !== current) return;
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === "message") appendMessage(payload.message);
    if (payload.type === "error") updateStatus(payload.message || "메시지를 보내지 못했어요.");
  });
  current.addEventListener("close", () => {
    if (socket !== current || !activeFriend) return;
    socket = null;
    $("#chatSendBtn")?.setAttribute("disabled", "");
    updateStatus("연결이 끊겨 다시 연결 중...");
    reconnectTimer = setTimeout(connect, 2000);
  });
  current.addEventListener("error", () => {
    if (socket === current) updateStatus("서버 연결 상태를 확인하고 있어요.");
  });
}

async function openChat(email, nickname) {
  if (!email) return;
  closeConnection();
  activeFriend = { email, nickname: nickname || email };
  messageIds = new Set();
  $("#chatMessages")?.replaceChildren();
  $("#chatEmptyState")?.classList.remove("hidden");
  $("#chatFriendName").textContent = activeFriend.nickname;
  $("#chatFriendAvatar").textContent = activeFriend.nickname.slice(0, 1).toUpperCase();
  $("#chatInput").value = "";
  setHomeSections(true);
  $("#chatInput")?.focus();

  connect();
  try {
    const history = await apiRequest("/friends/" + encodeURIComponent(email) + "/messages");
    if (activeFriend?.email !== email) return;
    history.forEach(appendMessage);
  } catch (error) {
    if (activeFriend?.email === email) updateStatus(error.message);
  }
}

export function initFriendChat() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-email]");
    if (button) openChat(button.dataset.chatEmail, button.dataset.chatNickname);
  });

  $("#chatBackBtn")?.addEventListener("click", () => {
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
    if (!content || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ content }));
    input.value = "";
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".side-link[data-filter]")) return;
    activeFriend = null;
    closeConnection();
  });

  document.addEventListener("friends:open", () => {
    activeFriend = null;
    closeConnection();
  });
}
