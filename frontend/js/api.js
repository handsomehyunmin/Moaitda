import { API_BASE } from "./config.js";
import { state } from "./state.js";
import { clearSession } from "./session.js";
import { $$, showScreen } from "./ui.js";

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

    $$(".modal").forEach((modal) => {
      modal.classList.add("hidden");
    });

    showScreen("loginScreen");

    throw new Error("로그인이 만료됐어요. 다시 로그인해주세요.");
  }

  if (!response.ok) {
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : "요청을 처리하지 못했습니다.";

    throw new Error(message);
  }

  return data;
}
