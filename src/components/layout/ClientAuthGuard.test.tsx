import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "./ClientAuthGuard";
import api from "@/lib/api";

vi.mock("@/lib/api");

const mockGet = api.get as unknown as Mock;

// Foto del DOM tal como quedó en el primer commit, antes de que corran los
// efectos de la guardia: el useLayoutEffect del hermano corre en ese commit.
function firstCommitHtml(ui: React.ReactElement) {
  const snaps: string[] = [];
  const Snapshot = () => {
    useLayoutEffect(() => { snaps.push(document.body.innerHTML); });
    return null;
  };
  render(<>{ui}<Snapshot /></>);
  return snaps[0] ?? "";
}

beforeEach(() => {
  localStorage.setItem("auth_token", "tok");
  useAuthStore.setState({ user: null, isAuthenticated: false, token: null, sessionCheck: "idle" });
  mockGet.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// Mismo patrón que AuthGuard.test.tsx (panel): auditoría 2026-09-27, riesgo
// 3 — un 503 (servidor ocupado) al verificar la sesión no debe mandar a la
// clienta al login, porque le borraría una sesión que podría seguir válida.
describe("ClientAuthGuard — servidor ocupado no manda al login (Task 6)", () => {
  it("503 en los 3 intentos: muestra 'No pudimos verificar tu sesión' y 'Reintentar', sin navegar a /auth/login", async () => {
    vi.useFakeTimers();
    mockGet.mockRejectedValue({ response: { status: 503 } });

    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<ClientAuthGuard><div>PROTECTED</div></ClientAuthGuard>} />
          <Route path="/auth/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("No pudimos verificar tu sesión. El servidor está ocupado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("LOGIN")).toBeNull();
    expect(screen.queryByText("PROTECTED")).toBeNull();
  });

  it("el botón Reintentar llama a checkAuth (vuelve a pedir /auth/me)", async () => {
    vi.useFakeTimers();
    mockGet.mockRejectedValue({ response: { status: 503 } });

    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<ClientAuthGuard><div>PROTECTED</div></ClientAuthGuard>} />
          <Route path="/auth/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mockGet).toHaveBeenCalledTimes(3);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      await vi.runAllTimersAsync();
    });

    expect(mockGet.mock.calls.length).toBeGreaterThan(3);
  });
});

describe("ClientAuthGuard — con sesión ya autenticada", () => {
  it("pinta el contenido en el primer render, sin spinner ni verificación", () => {
    useAuthStore.setState({
      user: { id: "u-1", role: "client", displayName: "Ana", email: "ana@x.com" } as never,
      token: "tok", isAuthenticated: true, sessionCheck: "idle",
    });
    const first = firstCommitHtml(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<ClientAuthGuard><div>PROTECTED</div></ClientAuthGuard>} />
          <Route path="/auth/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("PROTECTED")).toBeInTheDocument();
    expect(first).toContain("PROTECTED");
    expect(first).not.toContain("animate-spin");
    expect(mockGet).not.toHaveBeenCalled();
  });
});
