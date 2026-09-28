import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "@/lib/api";
import type { User, LoginCredentials, RegisterData, AuthResponse } from "@/types/auth";

/* ── DEV-only bypass: alumna demo sin backend ──
   Activado solo en `import.meta.env.DEV`. En producción no existe.        */
const DEMO_EMAIL = "alumna@alma.test";
const DEMO_TOKEN_PREFIX = "dev-demo-";
const isDevDemoToken = (t: string | null) => Boolean(t && t.startsWith(DEMO_TOKEN_PREFIX));

const buildDemoUser = (): User => {
  const nowIso = new Date().toISOString();
  return {
    id: "dev-demo-alumna",
    email: DEMO_EMAIL,
    phone: "+524440000000",
    displayName: "Alumna Demo",
    display_name: "Alumna Demo",
    full_name: "Alumna Demo",
    gender: "female",
    photoUrl: null,
    photo_url: null,
    avatar_url: null,
    role: "client",
    emergencyContactName: null,
    emergency_contact_name: null,
    emergencyContactPhone: null,
    emergency_contact_phone: null,
    healthNotes: null,
    health_notes: null,
    acceptsCommunications: true,
    accepts_communications: true,
    dateOfBirth: null,
    date_of_birth: null,
    receiveReminders: true,
    receive_reminders: true,
    receivePromotions: false,
    receive_promotions: false,
    receiveWeeklySummary: true,
    receive_weekly_summary: true,
    createdAt: nowIso,
    created_at: nowIso,
    updatedAt: nowIso,
    updated_at: nowIso,
  };
};

// Resultado de la última verificación de sesión contra /auth/me:
// "idle" antes de verificar, "ok"/"unauthorized" tras una respuesta
// concluyente, y "unavailable" cuando el servidor no pudo confirmar nada
// (429, 5xx o red) — en ese caso NO se cierra la sesión (auditoría 2026-09-27,
// riesgo 3: un límite de velocidad no debe verse como "no autorizada").
export type SessionCheck = "idle" | "ok" | "unauthorized" | "unavailable";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionCheck: SessionCheck;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  updateUser: (user: User) => void;
  setAuth: (user: User, token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      sessionCheck: "idle",

      login: async (credentials) => {
        set({ isLoading: true, error: null });

        // Dev-only demo bypass: alumna sin backend ni BD.
        if (import.meta.env.DEV && credentials.email.trim().toLowerCase() === DEMO_EMAIL) {
          const user = buildDemoUser();
          const token = `${DEMO_TOKEN_PREFIX}${Date.now()}`;
          localStorage.setItem("auth_token", token);
          await new Promise((r) => setTimeout(r, 250));
          set({ user, token, isAuthenticated: true, isLoading: false });
          return;
        }

        try {
          const res = await api.post<AuthResponse>("/auth/login", credentials);
          const { user, token } = res.data;
          localStorage.setItem("auth_token", token);
          set({ user, token, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          set({ error: err.response?.data?.message ?? "Error al iniciar sesión", isLoading: false });
          throw err;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const res = await api.post<AuthResponse>("/auth/register", data);
          const { user, token } = res.data;
          localStorage.setItem("auth_token", token);
          set({ user, token, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          set({ error: err.response?.data?.message ?? "Error al registrarse", isLoading: false });
          throw err;
        }
      },

      logout: () => {
        localStorage.removeItem("auth_token");
        set({ user: null, token: null, isAuthenticated: false });
      },

      checkAuth: async () => {
        const token = localStorage.getItem("auth_token");
        if (!token) { set({ isLoading: false, sessionCheck: "unauthorized" }); return; }

        // Dev demo: mantener la sesión sintetizada sin pegarle al backend.
        if (import.meta.env.DEV && isDevDemoToken(token)) {
          set({ user: buildDemoUser(), token, isAuthenticated: true, isLoading: false, sessionCheck: "ok" });
          return;
        }

        set({ isLoading: true });
        // Reintentos con backoff: un 429/5xx/red no significa "no autorizada" —
        // sólo que el servidor no pudo confirmar la sesión todavía (auditoría
        // 2026-09-27, riesgo 3). Sólo un 401 real cierra la sesión.
        const waits = [1000, 2000, 4000];
        for (let attempt = 0; ; attempt++) {
          try {
            const res = await api.get<{ user: User }>("/auth/me");
            set({ user: res.data.user, token, isAuthenticated: true, isLoading: false, sessionCheck: "ok" });
            return;
          } catch (err: any) {
            const status = err?.response?.status;
            if (status === 401) {
              localStorage.removeItem("auth_token");
              set({ user: null, token: null, isAuthenticated: false, isLoading: false, sessionCheck: "unauthorized" });
              return;
            }
            if (attempt >= waits.length - 1) {
              // 429, 5xx o red: la sesión NO se cierra; se conserva lo que había.
              set((s) => ({ token, isLoading: false, sessionCheck: "unavailable", isAuthenticated: Boolean(s.user) }));
              return;
            }
            const ra = Number(err?.response?.headers?.["retry-after"]);
            await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? ra * 1000 : waits[attempt]));
          }
        }
      },

      clearError: () => set({ error: null }),

      updateUser: (user) => set({ user }),

      setAuth: (user, token) => {
        localStorage.setItem("auth_token", token);
        set({ user, token, isAuthenticated: true });
      },
    }),
    {
      name: "auth-storage",
      // sessionCheck (y isLoading/error) son resultado transitorio de la
      // última verificación, no datos de sesión durables: si se persisten,
      // un "unavailable" guardado justo antes de cerrar la pestaña se lee de
      // vuelta al recargar y puede quedar pegado hasta que resuelva el
      // siguiente checkAuth(). Al excluirlos, cada carga arranca en "idle" y
      // sólo un checkAuth() fresco decide el valor real (auditoría
      // 2026-09-27, riesgo 3).
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);
