import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import SettingsPage from "./SettingsPage";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
let general: Record<string, unknown>;

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  loginAs("admin");
  general = { studio_name: "HIVE Pilates Studio", instagram: "@hive.pilates", opening_pricing_active: true, maintenance_mode: false, venue_media_url: "" };
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/admin/bank-info": { data: {} },
    "/evolution/status": { data: { state: "close" } },
    "/settings/notification_templates": { data: {} },
    "/settings/notification_settings": { data: {} },
    "/admin/wallet/notifications": { data: [] },
    "/settings/policies_settings": { data: {} },
  });
  // general_settings devuelve siempre lo último guardado (la media puede cambiar entre lectura y guardado).
  const base = mockApi.get.getMockImplementation()!;
  mockApi.get.mockImplementation((url: string) =>
    url === "/settings/general_settings" ? Promise.resolve({ data: { data: { ...general } } }) : base(url));
});

describe("Configuración", () => {
  it("guardar General no deshace la media subida después de cargar el formulario", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings" });
    const nombre = await screen.findByLabelText("Nombre del estudio");
    await waitFor(() => expect(nombre).toHaveValue("HIVE Pilates Studio"));
    general = { ...general, venue_media_url: "https://archivos/estudio.jpg", venue_media_type: "image" }; // otra parte guardó media
    fireEvent.change(nombre, { target: { value: "HIVE Coyoacán" } });
    fireEvent.click(await screen.findByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/settings/general_settings", {
      value: expect.objectContaining({ studio_name: "HIVE Coyoacán", venue_media_url: "https://archivos/estudio.jpg" }),
    }));
  });

  it("guardar un campo no revierte su valor y un segundo guardado no pisa el primero (I1)", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings" });
    const nombre = await screen.findByLabelText("Nombre del estudio");
    await waitFor(() => expect(nombre).toHaveValue("HIVE Pilates Studio"));

    fireEvent.change(nombre, { target: { value: "HIVE Coyoacán" } });
    fireEvent.click(await screen.findByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
    // El campo debe conservar el valor guardado, no regresar al de antes de guardar.
    expect(nombre).toHaveValue("HIVE Coyoacán");
    expect(screen.queryByText("Tienes cambios sin guardar")).toBeNull();

    const instagram = screen.getByLabelText("Instagram (@usuario)");
    fireEvent.change(instagram, { target: { value: "@nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(2));
    // El segundo guardado debe seguir mandando el valor nuevo del primer campo.
    expect(mockApi.put).toHaveBeenLastCalledWith("/settings/general_settings", {
      value: expect.objectContaining({ studio_name: "HIVE Coyoacán", instagram: "@nuevo" }),
    });
  });

  it("Pagos: guardar datos de transferencia conserva los valores (I1)", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/admin/bank-info": { data: { bank: "BBVA", account_holder: "Estudio", clabe: "012700015394444888" } },
      "/evolution/status": { data: { state: "close" } },
      "/settings/notification_templates": { data: {} },
      "/settings/notification_settings": { data: {} },
      "/admin/wallet/notifications": { data: [] },
      "/settings/policies_settings": { data: {} },
      "/settings/general_settings": { data: { ...general } },
    });
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=payments", path: "/admin/settings" });
    const holder = await screen.findByPlaceholderText("Nombre del titular");
    await waitFor(() => expect(holder).toHaveValue("Estudio"));
    fireEvent.change(holder, { target: { value: "Estudio Nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos de transferencia" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
    expect(holder).toHaveValue("Estudio Nuevo");
  });

  it("la barra de cambios sólo aparece al editar y Descartar regresa los valores", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings" });
    const nombre = await screen.findByLabelText("Nombre del estudio");
    await waitFor(() => expect(nombre).toHaveValue("HIVE Pilates Studio"));
    expect(screen.queryByText("Tienes cambios sin guardar")).toBeNull();
    fireEvent.change(nombre, { target: { value: "Otro" } });
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(nombre).toHaveValue("HIVE Pilates Studio");
  });

  it("recepción no ve la pestaña Pagos y ?tab=payments cae a General (I3)", async () => {
    loginAs("reception");
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=payments", path: "/admin/settings" });
    expect(await screen.findByRole("tab", { name: /General/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /Pagos/ })).toBeNull();
  });

  it("?tab= abre la sección y cambiar de sección cambia la URL", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=security", path: "/admin/settings" });
    expect(await screen.findByRole("tab", { name: /Seguridad/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Pagos/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/settings?tab=payments"));
  });

  it("Notificaciones enlaza a las plantillas habilitadas", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=notifications", path: "/admin/settings" });
    await screen.findByRole("tab", { name: /Notificaciones/ });
    const links = screen.queryAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(links).toContain("/admin/whatsapp-templates");
  });

  it("historial del pase: un recordatorio omitido por canal caído se ve como Omitido, no como Error", async () => {
    const logs = [
      { id: "l1", display_name: "Ana Omitida", reason: "class_reminder_b1", status: "skipped_disconnected", created_at: "2026-09-27T10:00:00Z" },
      { id: "l2", display_name: "Bea Parcial", reason: "wallet_update", status: "partial", created_at: "2026-09-27T10:01:00Z" },
      { id: "l3", display_name: "Caro Falló", reason: "class_reminder_b3", status: "failed", created_at: "2026-09-27T10:02:00Z" },
    ];
    const base = mockApi.get.getMockImplementation()!;
    mockApi.get.mockImplementation((url: string) =>
      url.startsWith("/admin/wallet/notifications") ? Promise.resolve({ data: { data: logs } }) : base(url));
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=notifications", path: "/admin/settings" });
    const fila = (nombre: string) => screen.getByText(nombre).closest("div.rounded-lg") as HTMLElement;

    await screen.findByText("Ana Omitida");
    const omitido = within(fila("Ana Omitida")).getByText("Omitido");
    const parcial = within(fila("Bea Parcial")).getByText("Parcial");
    expect(omitido.className).toBe(parcial.className);
    expect(within(fila("Ana Omitida")).queryByText("Error")).toBeNull();
    expect(within(fila("Caro Falló")).getByText("Error")).toBeInTheDocument();
  });
});
