import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import api from "@/lib/api";
import ProfileEdit from "./ProfileEdit";
import { renderPage, respuestas } from "@/test/renderPage";
import { useAuthStore } from "@/stores/authStore";

// jsdom no implementa IntersectionObserver (usado por StickyCta, que envuelve
// el botón "Guardar cambios" de este formulario); stub mínimo local, como en
// src/components/app/widgets.test.tsx, para no tocar el setup compartido.
if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  // @ts-expect-error jsdom no lo define
  window.IntersectionObserver = MockIntersectionObserver;
  global.IntersectionObserver = MockIntersectionObserver;
}

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const U = {
  id: "u1", role: "client", displayName: "Ana Pérez", email: "ana@correo.com", phone: "+525512345678",
  healthNotes: null, healthConsentVersion: null, healthConsentAt: null,
};

function montar(user: Record<string, unknown>) {
  useAuthStore.setState({ user, token: "t", isAuthenticated: true } as never);
  vi.mocked(api.get).mockImplementation(respuestas({ "/me/notifications/unread-count": { data: { unread_count: 0 } } }) as never);
  renderPage(<ProfileEdit />, "/app/profile/edit");
}

beforeEach(() => {
  vi.mocked(api.put).mockReset();
  vi.mocked(api.delete).mockReset();
});

describe("Perfil · consentimiento para datos de salud (P1-10)", () => {
  it("sin consentimiento, escribir notas de salud no guarda nada hasta marcar la casilla", async () => {
    montar(U);
    fireEvent.change(await screen.findByLabelText("Notas (opcional)"), { target: { value: "Lesión en rodilla" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Marca la casilla para guardar tus datos de salud.")).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo expresamente/ }));
    vi.mocked(api.put).mockResolvedValue({ data: { user: { ...U, healthNotes: "Lesión en rodilla" } } } as never);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/users/u1", expect.objectContaining({ healthNotes: "Lesión en rodilla", healthConsent: true })));
  });

  it("editar otros datos no pide la casilla", async () => {
    montar({ ...U, healthNotes: "Asma" });
    fireEvent.change(await screen.findByLabelText("Nombre completo"), { target: { value: "Ana P." } });
    vi.mocked(api.put).mockResolvedValue({ data: { user: { ...U, displayName: "Ana P." } } } as never);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(vi.mocked(api.put).mock.calls[0][1]).not.toHaveProperty("healthConsent");
  });

  it("con consentimiento vigente lo dice y permite retirarlo, que borra sus datos de salud", async () => {
    montar({ ...U, healthNotes: "Asma", healthConsentVersion: "2026-09-28", healthConsentAt: "2026-09-20T16:00:00Z" });
    expect(await screen.findByText("Autorizaste el tratamiento de tus datos de salud el 20 de septiembre, 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Autorizo expresamente/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retirar mi consentimiento" }));
    expect(screen.getByText("Se borran tus notas de salud y tus lesiones registradas. El equipo ya no las verá.")).toBeInTheDocument();
    vi.mocked(api.delete).mockResolvedValue({ data: { user: { ...U, healthNotes: null } } } as never);
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar y borrar" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/me/health-consent"));
  });
});
