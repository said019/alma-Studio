import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));
import api from "@/lib/api";
import ClientsList from "./ClientsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock; delete: Mock };
const CAMILA = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678", role: "client", createdAt: "2026-03-10T00:00:00" };
const FER = { id: "u2", displayName: "Fernanda Ortiz", email: "fer@correo.com", phone: null, role: "client", createdAt: "2026-05-02T00:00:00" };

const abrirMenu = (nombre: string) => fireEvent.keyDown(screen.getByRole("button", { name: nombre }), { key: "Enter" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  mockApi.delete.mockReset();
  toastSpy.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/users?role=client&search=": { data: [CAMILA, FER] },
    "/users?role=client&search=%C3%B1%26": { data: [] },
    "/users/u1": { data: { ...CAMILA, dateOfBirth: "1996-03-18T00:00:00.000Z", emergencyContactName: null, healthNotes: "Hombro derecho" } },
    "/plans?active=true": { data: [] },
    "/admin/birthdays?month=9": { data: [{ id: "u9", displayName: "Andrea Martínez", email: "andrea@correo.com", phone: "5523456789", isToday: true, day: 25, month: 9 }] },
  });
});
afterEach(() => vi.useRealTimers());

describe("Personas · Clientas", () => {
  it("lista con WhatsApp sólo para quien tiene teléfono", async () => {
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    expect(await screen.findByText("Camila Torres")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp a Camila Torres" })).toHaveAttribute("href", "https://wa.me/525512345678");
    expect(screen.queryByRole("link", { name: "WhatsApp a Fernanda Ortiz" })).toBeNull();
    expect(screen.getByText((_, el) => el?.textContent === "2 clientas registradas")).toBeInTheDocument();
  });

  it("la búsqueda va codificada", async () => {
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    fireEvent.change(await screen.findByLabelText("Buscar por nombre, email o teléfono"), { target: { value: "ñ&" } });
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith("/users?role=client&search=%C3%B1%26"));
  });

  it("Editar abre la clienta completa, sin campos vacíos por null", async () => {
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    await screen.findByText("Camila Torres");
    abrirMenu("Acciones de Camila Torres");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
    const nombre = await screen.findByLabelText("Nombre completo");
    await waitFor(() => expect(nombre).toHaveValue("Camila Torres"));
    expect(screen.getByLabelText("Notas de salud")).toHaveValue("Hombro derecho");
    fireEvent.change(nombre, { target: { value: "Camila Torres Ruiz" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/users/u1", expect.objectContaining({
      displayName: "Camila Torres Ruiz", dateOfBirth: "1996-03-18", emergencyContactName: "", role: "client",
    })));
  });

  it("si no se puede eliminar, dice por qué", async () => {
    mockApi.delete.mockRejectedValue({ response: { data: { message: "Tiene membresías activas" } } });
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    await screen.findByText("Camila Torres");
    abrirMenu("Acciones de Camila Torres");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Eliminar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar clienta" }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: "Tiene membresías activas" })));
  });

  it("?birthday=month muestra a las cumpleañeras del mes y se puede quitar", async () => {
    renderAdmin(<ClientsList />, { route: "/admin/clients?birthday=month", path: "/admin/clients" });
    expect(await screen.findByText("Cumpleañeras de septiembre")).toBeInTheDocument();
    expect(await screen.findByText("Andrea Martínez")).toBeInTheDocument();
    expect(screen.queryByText("Camila Torres")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/clients"));
  });

  it("recepción no ve 'Editar' en el menú de la fila (I3)", async () => {
    loginAs("reception");
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    await screen.findByText("Camila Torres");
    abrirMenu("Acciones de Camila Torres");
    expect(await screen.findByRole("menuitem", { name: "Eliminar" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Editar" })).toBeNull();
  });

  it("?birthday=month con la petición caída muestra un error, no el vacío de clientas (I4)", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/users?role=client&search=": { data: [CAMILA, FER] },
      "/plans?active=true": { data: [] },
      "/admin/birthdays?month=9": Object.assign(new Error("500"), { response: { status: 500, data: {} } }),
    });
    renderAdmin(<ClientsList />, { route: "/admin/clients?birthday=month", path: "/admin/clients" });
    expect(await screen.findByText("No pudimos cargar a las clientas")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay clientas registradas")).toBeNull();
  });

  it("?birthday=month sin cumpleañeras dice que nadie cumple ese mes, no el vacío de clientas (I4)", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/users?role=client&search=": { data: [CAMILA, FER] },
      "/plans?active=true": { data: [] },
      "/admin/birthdays?month=9": { data: [] },
    });
    renderAdmin(<ClientsList />, { route: "/admin/clients?birthday=month", path: "/admin/clients" });
    expect(await screen.findByText("Nadie cumple años en septiembre.")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay clientas registradas")).toBeNull();
  });
});
