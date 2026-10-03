import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, respuestas } from "@/test/renderPage";
import api from "@/lib/api";
import Notifications from "./Notifications";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({ ClientAuthGuard: ({children}: {children: React.ReactNode}) => <>{children}</> }));
afterEach(() => vi.clearAllMocks());
const notice = (category: string, title: string) => ({id:category, category, title, body:'Detalle del aviso',time:'2026-10-03T12:00:00Z'});
describe('Puntos desactivados en la bandeja', () => {
  it('oculta ganancias, reversos y premios antiguos pero conserva reservas y avisos', async () => {
    vi.mocked(api.get).mockImplementation(respuestas({'/me/notifications?':{data:[notice('loyalty_earn','Clase asistida +10'),notice('loyalty_spend','Reverso -10'),notice('milestone','Premio 100'),notice('booking','Reserva confirmada'),notice('marketing','Aviso del estudio')]}}) as never);
    renderPage(<Notifications/>);
    expect(await screen.findByText('Reserva confirmada')).toBeInTheDocument();
    expect(screen.getByText('Aviso del estudio')).toBeInTheDocument();
    for(const title of ['Clase asistida +10','Reverso -10','Premio 100']) expect(screen.queryByText(title)).toBeNull();
  });
  it('no promete puntos cuando sólo había movimientos de lealtad', async () => {
    vi.mocked(api.get).mockImplementation(respuestas({'/me/notifications?':{data:[notice('loyalty_earn','Bono de bienvenida')]}}) as never);
    renderPage(<Notifications/>);
    expect(await screen.findByText('Sin novedades aún.')).toBeInTheDocument();
    expect(screen.getByText('Aquí van a aparecer tus reservas y avisos del estudio.')).toBeInTheDocument();
    expect(screen.queryByText(/puntos ganados/)).toBeNull();
  });
});
