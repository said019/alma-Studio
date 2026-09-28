import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import api from "@/lib/api";
import WhatsAppBanner from "./WhatsAppBanner";
import { useAuthStore } from "@/stores/authStore";
import { routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

function renderBanner() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WhatsAppBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Aviso de canal caído: los avisos y recordatorios por WhatsApp no salen
// cuando Evolution está desconectado (auditoría 2026-09-27, P0-1).
describe("WhatsAppBanner", () => {
  beforeEach(() => {
    mockApi.get.mockReset();
  });

  it("dueña + canal desconectado + avisos encendidos → aparece el aviso", async () => {
    useAuthStore.setState({ user: { role: "admin" } as never });
    routeApi(mockApi, {
      "/evolution/status": { data: { connected: false } },
      "/settings/notification_settings": { data: { whatsapp_reminders: true } },
    });
    renderBanner();
    expect(await screen.findByRole("alert")).toHaveTextContent(/WhatsApp desconectado/);
  });

  it("dueña + canal conectado → no aparece", async () => {
    useAuthStore.setState({ user: { role: "admin" } as never });
    routeApi(mockApi, {
      "/evolution/status": { data: { connected: true } },
      "/settings/notification_settings": { data: { whatsapp_reminders: true } },
    });
    renderBanner();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith("/evolution/status"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rol recepción → no aparece (ni consulta la API)", async () => {
    useAuthStore.setState({ user: { role: "reception" } as never });
    renderBanner();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});
