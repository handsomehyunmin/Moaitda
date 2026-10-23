import { SESSION_KEY } from "./config.js";
import { state } from "./state.js";

export function saveSession() {
  if (!state.currentUser || !state.sessionToken) return;

  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        user: {
          email: state.currentUser.email,
          nickname: state.currentUser.nickname,
          profileImage: state.currentUser.profileImage || ""
        },
        token: state.sessionToken
      })
    );
  } catch (error) {
    console.warn("Session storage unavailable", error);
  }
}

export function clearSession() {
  state.currentUser = null;
  state.sessionToken = "";
  state.posts = [];
  state.selectedPostId = null;

  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.warn("Session storage unavailable", error);
  }
}

export function restoreSession() {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(SESSION_KEY) || "null"
    );

    if (
      saved &&
      typeof saved.token === "string" &&
      saved.token &&
      typeof saved.user?.email === "string" &&
      typeof saved.user?.nickname === "string"
    ) {
      state.currentUser = {
        email: saved.user.email,
        nickname: saved.user.nickname,
        profileImage: saved.user.profileImage || ""
      };

      state.sessionToken = saved.token;
    }
  } catch (error) {
    clearSession();
  }
}
