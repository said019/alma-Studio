import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { useAuthStore } from "./authStore";
import api from "@/lib/api";

vi.mock("@/lib/api");

const mockGet = api.get as unknown as Mock;

beforeEach(() => {
  localStorage.setItem("auth_token", "tok");
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, sessionCheck: "idle" });
  mockGet.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkAuth — no cierra sesión por un límite de velocidad (auditoría, Task 6)", () => {
  it("401: sesión inválida de verdad → borra el token y marca 'unauthorized'", async () => {
    mockGet.mockRejectedValue({ response: { status: 401 } });

    await useAuthStore.getState().checkAuth();

    expect(localStorage.getItem("auth_token")).toBeNull();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.sessionCheck).toBe("unauthorized");
  });

  it("429 en los 3 intentos: conserva el token y marca 'unavailable', sin ir a /auth/login", async () => {
    vi.useFakeTimers();
    mockGet.mockRejectedValue({ response: { status: 429, headers: { "retry-after": "0" } } });

    const promise = useAuthStore.getState().checkAuth();
    await vi.runAllTimersAsync();
    await promise;

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(mockGet).not.toHaveBeenCalledWith("/auth/login");
    expect(localStorage.getItem("auth_token")).toBe("tok");
    const state = useAuthStore.getState();
    expect(state.sessionCheck).toBe("unavailable");
    expect(state.token).toBe("tok");
  });

  it("429 una vez y luego 200: se autentica y marca 'ok'", async () => {
    vi.useFakeTimers();
    mockGet
      .mockRejectedValueOnce({ response: { status: 429, headers: { "retry-after": "0" } } })
      .mockResolvedValueOnce({ data: { user: { id: "u", role: "admin" } } });

    const promise = useAuthStore.getState().checkAuth();
    await vi.runAllTimersAsync();
    await promise;

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.sessionCheck).toBe("ok");
    expect(state.user).toEqual({ id: "u", role: "admin" });
  });

  it("error de red (sin response): conserva el token y marca 'unavailable'", async () => {
    vi.useFakeTimers();
    mockGet.mockRejectedValue(new Error("Network Error"));

    const promise = useAuthStore.getState().checkAuth();
    await vi.runAllTimersAsync();
    await promise;

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem("auth_token")).toBe("tok");
    const state = useAuthStore.getState();
    expect(state.sessionCheck).toBe("unavailable");
  });

  // Ronda de ajustes 1 — ruling del controlador: un proxy o CDN puede mandar
  // Retry-After de horas en un 5xx; sin tope, la guardia se quedaría en
  // "Cargando…" todo ese tiempo. La espera real nunca debe pasar de 10 s.
  it("Retry-After de una hora: la espera se acota a 10 s, no espera los 3600 s", async () => {
    vi.useFakeTimers();
    mockGet.mockRejectedValue({ response: { status: 429, headers: { "retry-after": "3600" } } });

    const promise = useAuthStore.getState().checkAuth();
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Si la espera respetara los 3600 s del header, este avance de 10 s no
    // alcanzaría para un segundo intento.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockGet).toHaveBeenCalledTimes(2);

    await vi.runAllTimersAsync();
    await promise;
    expect(useAuthStore.getState().sessionCheck).toBe("unavailable");
  });
});
