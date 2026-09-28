import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import AuditLogPage from "./AuditLogPage";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const venta = {
  id: "e1", createdAt: "2026-09-28T16:05:00Z", actorId: "a1", actorName: "Dueña HIVE", actorRole: "admin",
  action: "membership.sale", entityType: "membership", entityId: "m1", subjectUserId: "u1", subjectName: "Ana Pérez",
  reason: "Cortesía por evento", before: null,
  after: { plan_name: "Paquete 8", amount: 0, list_price: 1700, payment_method: "cash", payment_reference: "ORD-000001" },
  meta: { courtesy: true },
};
const ajuste = {
  ...venta, id: "e2", actorId: "a2", actorName: "Recepción Uno", actorRole: "reception", action: "membership.adjust",
  reason: "Compensación por clase cancelada", before: { classes_remaining: 1 }, after: { classes_remaining: 3 }, meta: {},
};
const ACTORES = { data: [{ id: "a1", name: "Dueña HIVE", role: "admin" }, { id: "a2", name: "Recepción Uno", role: "reception" }] };

function montar(pagina: unknown = { data: [venta, ajuste], page: 1, limit: 50, total: 2 }, route = "/admin/bitacora") {
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/admin/audit?": pagina, "/admin/audit/actors": ACTORES });
  renderAdmin(<AuditLogPage />, { route, path: "/admin/bitacora" });
}
const pedidas = () => mockApi.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/admin/audit?"));

beforeEach(() => { mockApi.get.mockReset(); });

describe("Bitácora", () => {
  it("la dueña ve qué pasó, quién, sobre quién, el motivo y el antes → después", async () => {
    loginAs("admin");
    montar();
    const lista = await screen.findByRole("list", { name: "Movimientos" });
    expect(within(lista).getByText("Cortesía en mostrador ($0)")).toBeInTheDocument();
    expect(within(lista).getByText("Ajuste de membresía")).toBeInTheDocument();
    expect(within(lista).getByText("Dueña HIVE")).toBeInTheDocument();
    expect(within(lista).getAllByText("Ana Pérez")).toHaveLength(2);
    expect(within(lista).getByText("Cortesía por evento")).toBeInTheDocument();
    expect(within(lista).getByText("$0")).toBeInTheDocument();
    expect(within(lista).getByText("$1,700")).toBeInTheDocument();
    expect(within(lista).getByText("1 → 3")).toBeInTheDocument();
    expect(pedidas()[0]).toBe("/admin/audit?page=1&limit=50");
  });

  it("muestra crédito, puntos y conteos del meta, sin abrir datos personales", async () => {
    loginAs("admin");
    const cancelacion = {
      ...venta, id: "e3", action: "booking.cancel", reason: "Se enfermó",
      before: { status: "confirmed" }, after: { status: "cancelled" },
      meta: { credit_restored: true, points_reverted: 20 },
    };
    montar({ data: [cancelacion], page: 1, limit: 50, total: 1 });
    const lista = await screen.findByRole("list", { name: "Movimientos" });
    expect(within(lista).getByText(/Crédito devuelto: Sí/)).toBeInTheDocument();
    expect(within(lista).getByText(/Puntos revertidos: 20/)).toBeInTheDocument();
  });

  it("los filtros van a la URL y a la consulta, y vuelven a la página 1", async () => {
    loginAs("admin");
    montar(undefined, "/admin/bitacora?pagina=2");
    await screen.findByRole("list", { name: "Movimientos" });
    fireEvent.change(screen.getByLabelText("Qué"), { target: { value: "membership" } });
    await waitFor(() => expect(pedidas().at(-1)).toContain("entityType=membership"));
    expect(pedidas().at(-1)).toContain("page=1");
    expect(screen.getByTestId("location").textContent).toContain("que=membership");
    await screen.findByRole("option", { name: "Recepción Uno · Recepción" });
    fireEvent.change(screen.getByLabelText("Quién"), { target: { value: "a2" } });
    await waitFor(() => expect(pedidas().at(-1)).toContain("actorId=a2"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-01" } });
    await waitFor(() => expect(pedidas().at(-1)).toContain("from=2026-09-01"));
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
    await waitFor(() => expect(pedidas().at(-1)).toBe("/admin/audit?page=1&limit=50"));
  });

  it("?id= filtra por un registro o una clienta", async () => {
    loginAs("admin");
    montar(undefined, "/admin/bitacora?id=u1");
    await screen.findByRole("list", { name: "Movimientos" });
    expect(pedidas()[0]).toContain("entityId=u1");
    expect(screen.getByText(/Mostrando sólo lo relacionado con un registro/)).toBeInTheDocument();
  });

  it("paginación", async () => {
    loginAs("admin");
    montar({ data: [venta], page: 1, limit: 50, total: 120 });
    expect(await screen.findByText("Página 1 de 3 · 120 registros")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(pedidas().at(-1)).toContain("page=2"));
  });

  it("sin movimientos lo dice", async () => {
    loginAs("admin");
    montar({ data: [], page: 1, limit: 50, total: 0 });
    expect(await screen.findByText("Sin movimientos")).toBeInTheDocument();
  });

  it("un filtro que el servidor rechaza muestra su mensaje", async () => {
    loginAs("admin");
    montar(Object.assign(new Error("400"), { response: { status: 400, data: { message: "Fecha 'desde' inválida (usa AAAA-MM-DD)." } } }));
    expect(await screen.findByText("Fecha 'desde' inválida (usa AAAA-MM-DD).")).toBeInTheDocument();
  });

  it("recepción no entra ni pide la bitácora", async () => {
    loginAs("reception");
    montar();
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/app"));
    expect(mockApi.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/admin/audit"))).toEqual([]);
  });
});
