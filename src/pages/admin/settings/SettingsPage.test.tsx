import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

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

  it("la barra de cambios sólo aparece al editar y Descartar regresa los valores", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings" });
    const nombre = await screen.findByLabelText("Nombre del estudio");
    await waitFor(() => expect(nombre).toHaveValue("HIVE Pilates Studio"));
    expect(screen.queryByText("Tienes cambios sin guardar")).toBeNull();
    fireEvent.change(nombre, { target: { value: "Otro" } });
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(nombre).toHaveValue("HIVE Pilates Studio");
  });

  it("?tab= abre la sección y cambiar de sección cambia la URL", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=security", path: "/admin/settings" });
    expect(await screen.findByRole("tab", { name: /Seguridad/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Pagos/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/settings?tab=payments"));
  });

  it("Notificaciones ya no enlaza a plantillas apagadas", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=notifications", path: "/admin/settings" });
    await screen.findByRole("tab", { name: /Notificaciones/ });
    const links = screen.queryAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(links.filter((h) => h.includes("whatsapp-templates"))).toEqual([]);
  });
});
