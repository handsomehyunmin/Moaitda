import { API_BASE } from "./config.js";
import { state } from "./state.js";
import { $, showScreen, toast } from "./ui.js";
import {
  clearSession,
  saveSession
} from "./session.js";

let enterHomeCallback = () => {};
let signingUp = false;

async function login(email, password) {
  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: email,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      toast(
        data.detail ||
        "이메일 또는 비밀번호가 맞지 않습니다."
      );
      return;
    }

    state.sessionToken = data.token;

    state.currentUser = {
      email: data.username,
      nickname: data.nickname,
      profileImage: data.profileImage || ""
    };

    $("#loginForm").reset();

    saveSession();
    toast("로그인 성공!");
    enterHomeCallback();
  } catch (error) {
    console.error(error);
    toast("서버에 연결할 수 없습니다.");
  }
}

function handleSignupStepOne(event) {
  event.preventDefault();

  const email =
    $("#signupEmail")
      .value
      .trim()
      .toLowerCase();

  const password =
    $("#signupPassword").value;

  state.pendingSignup = {
    email,
    password
  };

  showScreen("nicknameScreen");
}

async function handleSignupStepTwo(event) {
  event.preventDefault();

  if (signingUp) return;

  const nickname =
    $("#nicknameInput").value.trim();

  if (
    nickname.length < 2 ||
    nickname.length > 10
  ) {
    toast("닉네임은 2~10글자로 입력해주세요.");
    return;
  }

  if (!state.pendingSignup) {
    toast("회원가입 정보를 다시 입력해주세요.");
    showScreen("signupScreen");
    return;
  }

  const button =
    event.currentTarget.querySelector(
      'button[type="submit"]'
    );

  const originalLabel = button.textContent;

  signingUp = true;
  button.disabled = true;
  button.textContent = "가입 중...";

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    8000
  );

  try {
    const response = await fetch(
      `${API_BASE}/signup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          username: state.pendingSignup.email,
          password: state.pendingSignup.password,
          nickname
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      toast(
        typeof data.detail === "string"
          ? data.detail
          : "회원가입에 실패했습니다."
      );
      return;
    }

    state.sessionToken = data.token;

    state.currentUser = {
      email: data.username,
      nickname: data.nickname,
      profileImage: data.profileImage || ""
    };

    state.pendingSignup = null;

    $("#signupForm").reset();
    $("#nicknameForm").reset();

    saveSession();
    toast("회원가입 성공!");
    enterHomeCallback();
  } catch (error) {
    console.error(error);

    toast(
      "서버에 연결할 수 없습니다. 백엔드 서버 실행 상태를 확인해주세요."
    );
  } finally {
    clearTimeout(timeout);

    signingUp = false;
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function logout() {
  clearSession();
  showScreen("loginScreen");
  toast("로그아웃했습니다.");
}

export function initAuth({ enterHome } = {}) {
  if (typeof enterHome === "function") {
    enterHomeCallback = enterHome;
  }

  $("#loginForm")?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const email =
        $("#loginEmail")
          .value
          .trim()
          .toLowerCase();

      const password =
        $("#loginPassword").value;

      await login(email, password);
    }
  );

  $("#signupForm")?.addEventListener(
    "submit",
    handleSignupStepOne
  );

  $("#nicknameForm")?.addEventListener(
    "submit",
    handleSignupStepTwo
  );

  $("#logoutBtn")?.addEventListener(
    "click",
    logout
  );
}
