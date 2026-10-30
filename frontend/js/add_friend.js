import { apiRequest, loadFriends } from "./friend.js";
import { closeModal, openModal, toast } from "./ui.js";

export function initAddFriend() {
  document.querySelector("#openAddFriendBtn")?.addEventListener("click", () => {
    openModal("addFriendModal");
  });
  document.querySelector("#friendsAddBtn")?.addEventListener("click", () => {
    openModal("addFriendModal");
  });

  const form = document.querySelector("#addFriendForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#friendEmail");
    const button = form.querySelector("button[type='submit']");
    const identifier = input.value.trim();
    if (!identifier) return;

    button.disabled = true;
    try {
      await apiRequest("/friends", {
        method: "POST",
        body: JSON.stringify({ email: identifier })
      });
      input.value = "";
      closeModal("addFriendModal");
      toast("친구 요청을 보냈습니다.");
      document.querySelector("#showFriendsBtn")?.click();
      await loadFriends();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
}
