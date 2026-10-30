import { API_BASE } from "./config.js";
import { state } from "./state.js";
import { clearSession } from "./session.js";
import { $$, showScreen } from "./ui.js";

function setFriendsView(panelId) {
  const showingFriends = panelId === "friendsPanel";
  ["#pageHeading", ".page-toolbar", "#postFeed", "#emptyState"].forEach((selector) => {
    document.querySelector(selector)?.classList.toggle("hidden", showingFriends);
  });
  document.querySelector("#friendsPanel")?.classList.toggle("hidden", !showingFriends);
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${state.sessionToken}`
    }
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (response.status === 401) {
    clearSession();
    $$(".modal").forEach((modal) => modal.classList.add("hidden"));
    showScreen("loginScreen");
    throw new Error("로그인이 만료됐어요. 다시 로그인해주세요.");
  }

  if (!response.ok) {
    const message = typeof data?.detail === "string" ? data.detail : "요청을 처리하지 못했습니다.";
    throw new Error(message);
  }

  return data;
}

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

export async function loadFriends() {
  const list = document.querySelector("#friendList");
  const status = document.querySelector("#friendListStatus");
  if (!list) return;
  list.replaceChildren();
  if (status) status.textContent = "친구 목록을 불러오는 중...";
  try {
    const data = await apiRequest("/friends");
    const friends = Array.isArray(data) ? data : (data?.friends || []);
    if (status) status.textContent = friends.length ? `${friends.length}명의 친구` : "아직 친구가 없습니다.";
    friends.forEach((friend) => {
      const item = document.createElement("article");
      item.className = "friend-card";
      const nickname = friend.nickname || friend.username || friend.email || "사용자";
      item.innerHTML = `<span class="friend-avatar">${escapeHtml(nickname.slice(0, 1).toUpperCase())}</span><div class="friend-info"><strong>${escapeHtml(nickname)}</strong><span>${escapeHtml(friend.email || "")}</span></div>`;
      list.append(item);
    });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

export function initFriends() {
  document.querySelector("#friendListRefresh")?.addEventListener("click", loadFriends);
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#showFriendsBtn")) return;
    setFriendsView("friendsPanel");
    $$(".side-link").forEach((link) => link.classList.remove("active"));
    document.querySelector("#showFriendsBtn")?.classList.add("active");
    loadFriends();
  }, true);
}
