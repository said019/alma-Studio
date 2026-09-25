import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
// M10: prender una función apagada (Bandeja/adminInbox) y comprobar que el
// control escondido vuelve a aparecer — spec §10 pide probar también el caso
// "encendida", no sólo el "apagada" (que ya cubren otras pruebas del panel).
vi.mock("@/config/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/features")>();
  return { ...actual, FEATURES: { ...actual.FEATURES, adminInbox: true } };
});
import api from "@/lib/api";
import AdminLayout from "./AdminLayout";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 } });
});

// El título móvil vive en un <span> con esta clase (AdminLayout.tsx); hay
// más de un nodo con el texto "Cobros" en pantalla (el link del menú, el
// título móvil), así que se aísla por esa clase en vez de por texto solo.
const findMobileTitle = () =>
  screen.getByText((content, el) => el?.tagName.toLowerCase() === "span" && (el as HTMLElement).className.includes("text-[17px]") && content.length > 0);

describe("AdminLayout · alias de sub-pantallas (M2)", () => {
  it("/admin/orders ilumina Cobros en el menú lateral y en el título móvil", async () => {
    loginAs("admin");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/orders", path: "/admin/orders" });
    const link = await screen.findByRole("link", { name: /Cobros/ });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(findMobileTitle().textContent).toBe("Cobros");
  });

  it("/admin/pasar-lista ilumina Reservas", async () => {
    loginAs("admin");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/pasar-lista", path: "/admin/pasar-lista" });
    const link = await screen.findByRole("link", { name: /Reservas/ });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(findMobileTitle().textContent).toBe("Reservas");
  });

  it("/admin/class-types y /admin/class-generator iluminan Clases", async () => {
    loginAs("admin");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/class-types", path: "/admin/class-types" });
    expect(await screen.findByRole("link", { name: /Clases/ })).toHaveAttribute("aria-current", "page");
  });

  it("/admin/staff ilumina Personas", async () => {
    loginAs("admin");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/staff", path: "/admin/staff" });
    expect(await screen.findByRole("link", { name: /Personas/ })).toHaveAttribute("aria-current", "page");
    expect(findMobileTitle().textContent).toBe("Personas");
  });
});

describe("AdminLayout · Bandeja con adminInbox encendido (M10, M11)", () => {
  it("la Bandeja vuelve a aparecer con su contador, y el texto de accesibilidad no dice 'pagos por verificar'", async () => {
    loginAs("admin");
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/admin/notifications/unread-count": { data: { unread_count: 5 } },
    });
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/dashboard", path: "/admin/dashboard" });
    const link = await screen.findByRole("link", { name: /Bandeja/ });
    expect(await within(link).findByText("5")).toBeInTheDocument();
    expect(within(link).queryByText(/pagos por verificar/)).toBeNull();
  });
});
