import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/admin/CheckinScanner", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Pasar lista (cámara)" /> : null),
}));
import api from "@/lib/api";
import TodayAttendance from "./TodayAttendance";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
const e = (id: string, status: string, name: string) =>
  ({ booking_id: id, status, checked_in_at: null, user_id: id, display_name: name, guest_name: null, phone: "5512345678" });
const clase = (id: string, start: string, end: string, type: string, cap: number, roster: object[]) =>
  ({ id, start_time: `${start}:00`, end_time: `${end}:00`, max_capacity: cap, class_type_name: type, instructor_name: "Fer", roster });
const DIA = [
  clase("c07", "07:00", "07:50", "Reformer Básico", 8, [e("a", "checked_in", "Ana Pérez")]),
  clase("c11", "11:00", "11:50", "Reformer Intermedio", 8, [e("d", "confirmed", "Camila Torres"), e("v", "checked_in", "Valeria Ruiz"), e("w", "waitlist", "Regina López")]),
  clase("c13", "13:00", "13:50", "Tower", 6, [e("t", "confirmed", "Sofía Gómez")]),
];

function montar(dia: object[] = DIA) {
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/admin/today-roster": { data: dia }, "/classes?start=": { data: [] } });
  renderAdmin(<TodayAttendance />, { route: "/admin/pasar-lista" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  loginAs("reception");
});
afterEach(() => vi.useRealTimers());

describe("Pasar lista", () => {
  it("abre la siguiente clase y marca check-in con un tap", async () => {
    montar();
    const actual = await screen.findByRole("region", { name: "Reformer Intermedio 11:00" });
    expect(within(actual).getByText("Empieza en 20 min")).toBeInTheDocument();
    expect(within(actual).getByText("Asistió")).toBeInTheDocument();
    expect(within(actual).getByText("Lista de espera")).toBeInTheDocument();
    fireEvent.click(within(actual).getByRole("button", { name: "Check-in de Camila Torres" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/bookings/d/check-in"));
  });

  it("las clases siguientes van plegadas y se abren", async () => {
    montar();
    const tower = await screen.findByRole("region", { name: "Tower 13:00" });
    expect(within(tower).queryByRole("button", { name: "Check-in de Sofía Gómez" })).toBeNull();
    expect(within(tower).getByText((content) => content.trim() === "1 pendiente")).toBeInTheDocument();
    expect(within(tower).queryAllByText((_, el) => /asistió|asistieron/i.test(el?.textContent ?? "")).length).toBe(0);
    fireEvent.click(within(tower).getByRole("button", { name: "Abrir lista de Tower" }));
    expect(within(tower).getByRole("button", { name: "Check-in de Sofía Gómez" })).toBeInTheDocument();
  });

  it("las que ya terminaron van al final", async () => {
    montar();
    const hechas = await screen.findByRole("region", { name: "Ya terminaron" });
    expect(within(hechas).getByText("Reformer Básico")).toBeInTheDocument();
  });

  it("marcar falta pide confirmación", async () => {
    montar();
    const actual = await screen.findByRole("region", { name: "Reformer Intermedio 11:00" });
    fireEvent.click(within(actual).getByRole("button", { name: "Marcar falta de Camila Torres" }));
    fireEvent.click(await screen.findByRole("button", { name: "Marcar falta" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/bookings/d/no-show"));
  });

  it("la cámara se abre desde aquí", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Escanear QR del pase/ }));
    expect(screen.getByRole("dialog", { name: "Pasar lista (cámara)" })).toBeInTheDocument();
  });

  it("sin clases, o con todas terminadas, lo dice", async () => {
    montar([]);
    expect(await screen.findByText("Hoy no hay clases")).toBeInTheDocument();
  });

  it("con todas terminadas no deja un bloque vacío", async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 14, 0));
    montar();
    expect(await screen.findByText("Ya terminaron las clases de hoy.")).toBeInTheDocument();
  });
});
