const apiHost = window.location.hostname || "127.0.0.1";
export const API_BASE = `${window.location.protocol === "https:" ? "https:" : "http:"}//${apiHost}:8000`;
export const SESSION_KEY = "together.session.v1";
