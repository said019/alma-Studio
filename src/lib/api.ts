import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const requestAuthorization = err.config?.headers?.Authorization;
    const currentToken = localStorage.getItem("auth_token");
    // A delayed response from a previous session must not sign out a newer login.
    if (err.response?.status === 401 && currentToken && requestAuthorization === `Bearer ${currentToken}`) {
      localStorage.removeItem("auth_token");
      const path = window.location.pathname;
      if (path.startsWith("/app") || path.startsWith("/admin") || path.startsWith("/staff")) {
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
