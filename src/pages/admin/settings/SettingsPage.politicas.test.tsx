import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import SettingsPage from "./SettingsPage";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
const POLICY = { data: { cancellationLimit: 2, cancelWindowHours: 12, bookingLeadHours: 2, waitlistCutoffHours: 2, faltasEnabled: true, faltasThreshold: 5 } };

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: { data: { ...POLICY.data, cancellationLimit: 3 } } });
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/public/booking-policy": POLICY,
    "/evolution/status": { data: { state: "close" } },
    "/settings/general_settings": { data: {} },
    "/settings/notification_settings": { data: {} },
    "/settings/notification_templates": { data: {} },
  });
});

const montar = () => renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=policies", path: "/admin/settings" });

describe("Configuración · Políticas (auditoría 2026-09-27, P0-4)", () => {
  it("la dueña cambia la cuota, ve cómo se publica y guarda", async () => {
    loginAs("admin");
    montar();
    const campo = await screen.findByLabelText("Cancelaciones permitidas por paquete");
    await waitFor(() => expect(campo).toHaveValue(2));
    const reglas = screen.getByRole("list", { name: "Reglas publicadas" });
    expect(within(reglas).getByText("Puedes cancelar hasta 2 veces por paquete. Salir de la lista de espera no cuenta.")).toBeInTheDocument();
    expect(screen.getByText("12 horas")).toBeInTheDocument();
    const guardar = screen.getByRole("button", { name: "Guardar" });
    expect(guardar).toBeDisabled();
    fireEvent.change(campo, { target: { value: "3" } });
    expect(within(reglas).getByText("Puedes cancelar hasta 3 veces por paquete. Salir de la lista de espera no cuenta.")).toBeInTheDocument();
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/admin/booking-policy", { cancellationLimit: 3 }));
  });

  it("0 es sin límite y un valor inválido no se puede guardar", async () => {
    loginAs("admin");
    montar();
    const campo = await screen.findByLabelText("Cancelaciones permitidas por paquete");
    await waitFor(() => expect(campo).toHaveValue(2));
    fireEvent.change(campo, { target: { value: "0" } });
    expect(screen.getByText("No hay límite de cancelaciones por paquete. Salir de la lista de espera no cuenta.")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "25" } });
    expect(screen.getByText("Escribe un número entero de 0 a 20.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("recepción la ve pero no la cambia", async () => {
    loginAs("reception");
    montar();
    const campo = await screen.findByLabelText("Cancelaciones permitidas por paquete");
    expect(campo).toBeDisabled();
    expect(screen.getByText("Sólo la dueña puede cambiarlo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  });

  it("ya no edita los textos legales: liga a las tres páginas", async () => {
    loginAs("admin");
    montar();
    await screen.findByLabelText("Cancelaciones permitidas por paquete");
    expect(screen.queryByLabelText("Política de privacidad")).toBeNull();
    expect(screen.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute("href", "/legal/terminos");
    expect(screen.getByRole("link", { name: "Aviso de privacidad" })).toHaveAttribute("href", "/legal/privacidad");
    expect(screen.getByRole("link", { name: "Política de cancelación" })).toHaveAttribute("href", "/legal/cancelacion");
  });
});
