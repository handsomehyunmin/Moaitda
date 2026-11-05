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
import { initAddFriend } from "./add_friend.js";
import { initFriends } from "./friend.js";

const dailyWords = [
  "좋은 생각은 나누는 순간 더 커져요.",
  "작은 기록이 좋은 대화의 시작이에요.",
  "오늘 나눈 이야기가 새로운 연결이 돼요.",
  "서로의 이야기에 귀 기울이는 하루가 되길 바라요."
];

function updateWelcomeCard() {
  const welcomeCard = document.querySelector("#homeWelcome");
  if (!welcomeCard) return;

  welcomeCard.classList.remove("hidden");
  const nickname = state.currentUser?.nickname || "사용자";
  const date = new Date();
  document.querySelector("#welcomeName").textContent = nickname;
  document.querySelector("#todayQuote").textContent = dailyWords[date.getDate() % dailyWords.length];
}

function enterHome() {
  showScreen("homeScreen");
  updateWelcomeCard();
  updateProfileUI();
  renderPosts();
  loadPosts();
  refreshProfile();
}

function startApp() {
  // Bind friend controls before the other UI modules initialize.
  initAddFriend();
  initFriends();

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
