import { apiRequest } from "./friend.js";
import { toast } from "./ui.js";

let searchTimer;
let searchVersion = 0;

async function searchFriends(query) {
  const status = document.querySelector("#friendSearchStatus");
  const results = document.querySelector("#friendSearchResults");
  const version = ++searchVersion;
  if (!query) {
    results.replaceChildren();
    status.textContent = "닉네임을 입력하면 검색 결과가 보여요.";
    return;
  }

  status.textContent = "찾는 중...";
  try {
    const people = await apiRequest(`/friends/search?q=${encodeURIComponent(query)}`);
    if (version !== searchVersion) return;
    results.replaceChildren();
    if (!people.length) {
      status.textContent = "검색 결과가 없습니다.";
      return;
    }
    status.textContent = `${people.length}명을 찾았어요.`;
    people.forEach((person) => {
      const row = document.createElement("article");
      row.className = "search-person";
      const avatar = document.createElement("span");
      avatar.className = "friend-avatar";
      avatar.textContent = (person.nickname || "?").slice(0, 1).toUpperCase();
      const info = document.createElement("div");
      info.className = "friend-info";
      const name = document.createElement("strong");
      name.textContent = person.nickname || "사용자";
      info.append(name);
      const button = document.createElement("button");
      button.type = "button";
      button.className = person.relationship === "none" ? "primary-btn compact" : "ghost-btn compact";
      button.dataset.addFriendId = person.id;
      const labels = { none: "친구 추가", requested: "요청 보냄", incoming: "요청 확인", friends: "친구" };
      button.textContent = labels[person.relationship] || "친구 추가";
      button.disabled = person.relationship !== "none";
      row.append(avatar, info, button);
      results.append(row);
    });
  } catch (error) {
    if (version === searchVersion) status.textContent = error.message;
  }
}

export function initAddFriend() {
  const input = document.querySelector("#friendSearchInput");
  input?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = input.value.trim();
    searchTimer = setTimeout(() => searchFriends(query), 250);
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-add-friend-id]");
    if (!button) return;
    button.disabled = true;
    try {
      await apiRequest("/friends", {
        method: "POST",
        body: JSON.stringify({ user_id: Number(button.dataset.addFriendId) })
      });
      toast("친구 요청을 보냈습니다.");
      await searchFriends(input.value.trim());
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  });

  document.querySelector("#openAddFriendBtn")?.addEventListener("click", () => {
    if (input) input.value = "";
    searchFriends("");
  });
  document.querySelector("#friendsAddBtn")?.addEventListener("click", () => {
    if (input) input.value = "";
    searchFriends("");
  });
}
