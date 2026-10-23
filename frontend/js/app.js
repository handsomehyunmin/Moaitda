import { state } from "./state.js";
import { showScreen } from "./ui.js";
import {
  restoreSession,
  saveSession
} from "./session.js";
import { initAuth } from "./auth.js";
import {
  initPosts,
  loadPosts,
  renderPosts
} from "./posts.js";
import {
  initComments,
  renderComments
} from "./comments.js";
import {
  initProfile,
  refreshProfile,
  updateProfileUI
} from "./profile.js";
import { initNavigation } from "./navigation.js";

function enterHome() {
  showScreen("homeScreen");
  updateProfileUI();
  renderPosts();
  loadPosts();
  refreshProfile();
}

function startApp() {
  initAuth({ enterHome });
  initPosts();

  initComments({
    refreshPosts: renderPosts
  });

  initProfile({
    renderPosts,
    renderComments
  });

  initNavigation({
    renderPosts
  });

  restoreSession();

  if (state.currentUser) {
    if (state.currentUser.nickname) {
      saveSession();
      enterHome();
    } else {
      showScreen("nicknameScreen");
    }
  } else {
    showScreen("loginScreen");
  }
}

startApp();
