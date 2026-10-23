export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];

export function showScreen(id) {
  $$(".screen").forEach((screen) => screen.classList.add("hidden"));
  $("#" + id)?.classList.remove("hidden");
}

export function toast(message) {
  const el = $("#toast");
  if (!el) return;

  el.textContent = message;
  el.classList.remove("hidden");

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    el.classList.add("hidden");
  }, 2200);
}

export function openModal(id) {
  $("#" + id)?.classList.remove("hidden");
}

export function closeModal(id) {
  $("#" + id)?.classList.add("hidden");
}
