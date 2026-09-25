import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, act } from "@testing-library/react";
import api from "@/lib/api";
import Dashboard from "./Dashboard";
import { renderPage, respuestas } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// La bandera real está apagada; aquí se puede encender para el caso de control.
const bandera = vi.hoisted(() => ({ walletExtras: false }));
vi.mock("@/config/features", async (original) => {
  const real = await original<typeof import("@/config/features")>();
  return {
    ...real,
    FEATURES: new Proxy(real.FEATURES, {
      get: (t, k) => (k === "walletExtras" ? bandera.walletExtras : t[k as keyof typeof t]),
    }),
  };
});

const LOGRO = { next_milestone: { name: "Constancia", classes_required: 10, award_points: 50 }, lifetime_classes: 4, next_remaining: 6 };
const base = {
  "/memberships/my": { data: { planName: "Plan 8 clases", classLimit: 8, classesRemaining: 5 } },
  "/wallet/pass": { data: { points: 120 } },
  "/me/notifications/unread-count": { data: { unread_count: 0 } },
};

/** Espera a que respondan todas las queries de la pantalla (incluida la de logros). */
const montar = async () => {
  renderPage(<Dashboard />, "/app");
  await screen.findByText("Plan 8 clases");
  await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith("/loyalty/milestones/me"));
  await act(() => new Promise((r) => setTimeout(r, 20)));
};

afterEach(() => {
  bandera.walletExtras = false;
  vi.clearAllMocks();
});

describe("Inicio: el próximo logro sólo existe con FEATURES.walletExtras (S1)", () => {
  describe("con la bandera apagada", () => {
    it('no pinta "Tu próximo logro" aunque haya un logro', async () => {
      vi.mocked(api.get).mockImplementation(respuestas({ ...base, "/loyalty/milestones/me": { data: LOGRO } }) as never);
      await montar();
      expect(screen.queryByText("Tu próximo logro")).toBeNull();
      expect(screen.queryByText("Constancia")).toBeNull();
    });
    it("tampoco pinta su estado de error", async () => {
      vi.mocked(api.get).mockImplementation(respuestas({ ...base, "/loyalty/milestones/me": new Error("500") }) as never);
      await montar();
      expect(screen.queryByText("Tu próximo logro")).toBeNull();
      expect(screen.queryByText("No pudimos cargar tu progreso de logros.")).toBeNull();
    });
  });

  describe("con la bandera encendida (control)", () => {
    beforeEach(() => {
      bandera.walletExtras = true;
    });
    it("pinta el logro con su anillo", async () => {
      vi.mocked(api.get).mockImplementation(respuestas({ ...base, "/loyalty/milestones/me": { data: LOGRO } }) as never);
      await montar();
      expect(screen.getByText("Tu próximo logro")).toBeInTheDocument();
      expect(screen.getByText("Constancia")).toBeInTheDocument();
    });
    it("y su error con reintento", async () => {
      vi.mocked(api.get).mockImplementation(respuestas({ ...base, "/loyalty/milestones/me": new Error("500") }) as never);
      await montar();
      expect(screen.getByText("No pudimos cargar tu progreso de logros.")).toBeInTheDocument();
    });
  });
});
