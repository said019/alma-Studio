import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import ClientDetail from "./ClientDetail";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const USER = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678", createdAt: "2026-03-10T00:00:00", onboardingCompleted: true };
const MEM = { id: "m1", planName: "Paquete 8 clases", status: "active", startDate: "2026-09-25", endDate: "2026-10-25", classesRemaining: 3, classLimit: 8 };
const booking = (id: string, start: string, status: string) => ({ id, className: `Clase ${id}`, startTime: start, status });

function tabla(over: Record<string, unknown> = {}) {
  return {
    "/admin/stats": { pendingAlerts: 0 },
    "/users/u1": { data: USER },
    "/bookings?userId=u1": { data: [
      booking("b0", "2026-09-20T07:00:00", "checked_in"),
      booking("b3", "2026-10-01T18:00:00", "confirmed"),
      booking("b1", "2026-09-26T11:00:00", "confirmed"),
      booking("b2", "2026-09-29T07:00:00", "waitlist"),
      booking("b4", "2026-10-03T09:00:00", "confirmed"),
      booking("b5", "2026-09-27T09:00:00", "cancelled"),
    ] },
    "/memberships?userId=u1": { data: [MEM] },
    "/payments?userId=u1": { data: [] },
    "/loyalty/points/u1": { data: { balance: 120 } },
    "/admin/users/u1/waiver": { data: { signed: true, signedAt: "2026-03-12T00:00:00", fullName: "Camila Torres" } },
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Ficha de clienta", () => {
  it("la dueña ve Editar, Pagos y la membresía con Renovar; Lealtad no aparece", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    expect(await screen.findByRole("heading", { level: 1, name: "Camila Torres" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar datos/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Pagos/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Lealtad/ })).toBeNull();
    const mem = screen.getByRole("region", { name: "Membresía" });
    expect(within(mem).getByText("3")).toBeInTheDocument();
    expect(within(mem).getByRole("link", { name: "Renovar" })).toHaveAttribute("href", "/admin/payments?clienta=u1");
  });

  it("próximas clases: sólo futuras, confirmadas o en espera, en orden y hasta 3", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const prox = await screen.findByRole("region", { name: "Próximas clases" });
    const items = await within(prox).findAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Clase b1"),
      expect.stringContaining("Clase b2"),
      expect.stringContaining("Clase b3"),
    ]);
  });

  it("recepción no ve Pagos ni Editar, ni pide los pagos", async () => {
    loginAs("reception");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    await screen.findByRole("heading", { level: 1, name: "Camila Torres" });
    expect(screen.queryByRole("tab", { name: /Pagos/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar datos/ })).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalledWith("/payments?userId=u1");
  });

  it("sin membresía activa lo dice y ofrece vender un plan", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({ "/memberships?userId=u1": { data: [] } }));
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const mem = await screen.findByRole("region", { name: "Membresía" });
    expect(await within(mem).findByText("Sin membresía activa")).toBeInTheDocument();
    expect(within(mem).getByRole("link", { name: "Vender plan" })).toHaveAttribute("href", "/admin/payments?clienta=u1");
  });

  it("Editar datos abre el panel de edición", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    fireEvent.click(await screen.findByRole("button", { name: /Editar datos/ }));
    expect(await screen.findByText("Editar clienta")).toBeInTheDocument();
  });

  it("Ver todas en Próximas clases selecciona la pestaña Reservas", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const prox = await screen.findByRole("region", { name: "Próximas clases" });
    fireEvent.click(within(prox).getByRole("button", { name: /Ver todas/ }));
    expect(screen.getByRole("tab", { name: /Reservas/ })).toHaveAttribute("aria-selected", "true");
  });

  it("el botón de cambiar foto mide 44 px", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const btn = await screen.findByRole("button", { name: "Cambiar foto" });
    expect(btn.className).toContain("h-11");
  });

  it("la fecha de nacimiento muestra la edad calculada con parseISO (M5)", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({ "/users/u1": { data: { ...USER, dateOfBirth: "1990-03-12" } } }));
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    await screen.findByRole("heading", { level: 1, name: "Camila Torres" });
    // Al 25 sep 2026 ya cumplió años en marzo: 2026 - 1990 = 36.
    expect(await screen.findByText((_, el) => el?.textContent === "12 mar 2026 · 36 años" || el?.textContent === "12 mar 1990 · 36 años")).toBeInTheDocument();
  });

  it("membresías: si la petición falla, no dice 'Sin membresía activa' ni ofrece Vender plan (I4)", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({ "/memberships?userId=u1": Object.assign(new Error("500"), { response: { status: 500, data: {} } }) }));
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const mem = await screen.findByRole("region", { name: "Membresía" });
    expect(await within(mem).findByText(/No pudimos cargar/)).toBeInTheDocument();
    expect(within(mem).queryByText("Sin membresía activa")).toBeNull();
    expect(within(mem).queryByRole("link", { name: "Vender plan" })).toBeNull();
  });

  it("próximas clases: si la petición falla, muestra error y no 'No tiene clases próximas' (I4)", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({ "/bookings?userId=u1": Object.assign(new Error("500"), { response: { status: 500, data: {} } }) }));
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const prox = await screen.findByRole("region", { name: "Próximas clases" });
    expect(await within(prox).findByText(/No pudimos cargar/)).toBeInTheDocument();
    expect(within(prox).queryByText("No tiene clases próximas.")).toBeNull();
  });

  it("responsiva: si la petición falla, no dice Pendiente (I4)", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({ "/admin/users/u1/waiver": Object.assign(new Error("500"), { response: { status: 500, data: {} } }) }));
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const resp = await screen.findByRole("region", { name: "Responsiva" });
    expect(within(resp).queryByText("Pendiente")).toBeNull();
  });
});
