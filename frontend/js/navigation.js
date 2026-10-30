import { state } from "./state.js";
import {
  $,
  $$,
  closeModal,
  showScreen
} from "./ui.js";

let renderPostsCallback = () => {};

export function initNavigation({ renderPosts } = {}) {
  if (typeof renderPosts === "function") {
    renderPostsCallback = renderPosts;
  }

  $$("[data-show]").forEach((button) => {
    button.addEventListener("click", () => {
      showScreen(button.dataset.show);
    });
  });

  $$("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.close);
    });
  });

  $("#searchInput")?.addEventListener(
    "input",
    () => renderPostsCallback()
  );

  $("#clearSearchBtn")?.addEventListener(
    "click",
    () => {
      $("#searchInput").value = "";

      state.currentFilter = {
        type: "all",
        value: null
      };

      $$(".side-link").forEach((link) => {
        link.classList.remove("active");
      });

      $(".side-link[data-filter='all']")
        ?.classList.add("active");

      renderPostsCallback();
    }
  );

  $$(".side-link[data-filter]").forEach(
    (button) => {
      button.addEventListener("click", () => {
        document.querySelector("#friendsPanel")?.classList.add("hidden");
        ["#pageHeading", ".page-toolbar", "#postFeed", "#emptyState"].forEach((selector) => {
          document.querySelector(selector)?.classList.remove("hidden");
        });
        state.currentFilter = {
          type: button.dataset.filter,
          value: null
        };

        $$(".side-link").forEach((link) => {
          link.classList.remove("active");
        });

        button.classList.add("active");
        renderPostsCallback();
      });
    }
  );

  $("#mobileMenuBtn")?.addEventListener(
    "click",
    () => {
      $("#sidebar")?.classList.toggle("open");
    }
  );

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    [
      "writeModal",
      "detailModal",
      "profileModal",
      "addFriendModal"
    ].forEach((id) => {
      closeModal(id);
    });
  });
}
