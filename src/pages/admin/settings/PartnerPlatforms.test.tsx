import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PartnerPlatforms from "./PartnerPlatforms";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };

const ROW = {
  environment: "production",
  is_enabled: true,
  gym_id: "g1",
  webhook_secret: "••••abcd",
  has_webhook_secret: true,
  access_token: null,
  has_access_token: false,
  api_base_url: null,
  booking_base_url: null,
  access_base_url: null,
  webhook_url: null,
  extra_config: {},
};

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: { data: ROW } });
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/partners/settings": { data: ROW },
  });
});

describe("Plataformas · Wellhub", () => {
  it("nunca muestra los secretos guardados: los inputs son password, vacíos, con el marcador enmascarado", async () => {
    renderAdmin(<PartnerPlatforms />, { route: "/admin/settings/partners" });
    await screen.findByText("Webhook secret (firma de los webhooks)");

    const webhookInput = screen.getByPlaceholderText("••••abcd · déjalo vacío para no cambiarlo") as HTMLInputElement;
    expect(webhookInput.type).toBe("password");
    expect(webhookInput.value).toBe("");

    const accessInput = screen.getByPlaceholderText("Sin configurar") as HTMLInputElement;
    expect(accessInput.type).toBe("password");
    expect(accessInput.value).toBe("");

    // Nunca aparece el secreto real en el DOM.
    expect(document.body.innerHTML).not.toContain("s3cr3t");
  });

  it("guardar sin tocar los secretos no manda webhook_secret ni access_token", async () => {
    renderAdmin(<PartnerPlatforms />, { route: "/admin/settings/partners" });
    await screen.findByText("Webhook secret (firma de los webhooks)");

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
    const body = mockApi.put.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(body, "webhook_secret")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body, "access_token")).toBe(false);
  });

  it("guardar tras escribir un nuevo webhook secret lo manda en claro", async () => {
    renderAdmin(<PartnerPlatforms />, { route: "/admin/settings/partners" });
    await screen.findByText("Webhook secret (firma de los webhooks)");

    const webhookInput = screen.getByPlaceholderText("••••abcd · déjalo vacío para no cambiarlo");
    fireEvent.change(webhookInput, { target: { value: "nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
    expect(mockApi.put).toHaveBeenCalledWith("/partners/settings", expect.objectContaining({ webhook_secret: "nuevo" }));
    const body = mockApi.put.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(body, "access_token")).toBe(false);
  });
});
