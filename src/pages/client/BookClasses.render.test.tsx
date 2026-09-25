import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import api from "@/lib/api";
import BookClasses from "./BookClasses";
import { renderPage, respuestas, atenuadoPor } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/* Miércoles 23 sep 2026, 10:00: semana del lunes 21 al domingo 27. */
const AHORA = new Date(2026, 8, 23, 10, 0);
const clase = (id: string, start: string, end: string, name: string, booked: number, max: number) => ({
  id, start_time: start, end_time: end, class_type_name: name, instructor_name: "Ana", current_bookings: booked, max_capacity: max,
});
const CLASES = [
  clase("llena", "2026-09-23T18:00:00", "2026-09-23T18:50:00", "Reformer", 4, 4),
  clase("ultimo", "2026-09-23T19:00:00", "2026-09-23T19:50:00", "Reformer", 3, 4),
  clase("pocos", "2026-09-23T20:00:00", "2026-09-23T20:50:00", "Studio Flow", 6, 8),
  clase("libre", "2026-09-24T09:00:00", "2026-09-24T09:50:00", "Studio Flow", 2, 8),
];

// jsdom no implementa scrollTo (la tira de días se centra en el día elegido).
Element.prototype.scrollTo = () => {};

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  vi.mocked(api.get).mockImplementation(respuestas({
    "/classes": { data: CLASES },
    "/memberships/my": { data: { status: "active", classCategory: "all", classesRemaining: 5 } },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Reservar: la clase llena se atenúa sin apagar su acción (I1)", () => {
  it('"Lista de espera" no queda dentro de un contenedor con opacidad, en la fila móvil ni en la celda de escritorio', async () => {
    renderPage(<BookClasses />, "/app/classes");
    const botones = await screen.findAllByRole("button", { name: /Lista de espera/ });
    expect(botones).toHaveLength(2);
    for (const b of botones) expect(atenuadoPor(b)).toEqual([]);
  });

  it("la información de la clase llena (hora, clase, meta) sí va atenuada al 60 %", async () => {
    renderPage(<BookClasses />, "/app/classes");
    const horas = await screen.findAllByText("18:00");
    expect(horas).toHaveLength(2);
    for (const h of horas) {
      expect(atenuadoPor(h).map((n) => n.className)).toEqual([expect.stringMatching(/(?:^|\s)opacity-60(?:\s|$)/)]);
    }
  });

  it("las pills de la fila (categoría) y los botones Reservar quedan a opacidad completa", async () => {
    renderPage(<BookClasses />, "/app/classes");
    await screen.findAllByRole("button", { name: /Lista de espera/ });
    const pills = screen.getAllByText("Reformer/Tower").filter((el) => el.className.includes("rounded-full"));
    expect(pills.length).toBeGreaterThan(0);
    for (const p of pills) expect(atenuadoPor(p)).toEqual([]);
    for (const b of screen.getAllByRole("button", { name: /Reservar$/ })) expect(atenuadoPor(b)).toEqual([]);
  });
});

describe("Reservar: vuelven la marca de hoy y las etiquetas de escasez (M7)", () => {
  it('"Último lugar" (1 lugar) y "Pocos lugares" (2) vuelven, en pill terracota suave', async () => {
    renderPage(<BookClasses />, "/app/classes");
    await screen.findAllByRole("button", { name: /Lista de espera/ });
    for (const label of ["Último lugar", "Pocos lugares"]) {
      const pills = screen.getAllByText(label);
      expect(pills, label).toHaveLength(2); // fila móvil y celda de escritorio
      for (const p of pills) {
        expect(p.className).toMatch(/\bbg-accent-soft\b/);
        expect(atenuadoPor(p)).toEqual([]);
      }
    }
    // Con 6 lugares libres no hay etiqueta de escasez.
    expect(screen.getAllByText(/Último lugar|Pocos lugares/)).toHaveLength(4);
  });

  it("la tira de días marca hoy: cifra en text-accent-strong dark:text-accent y negrita cuando no está elegido", async () => {
    renderPage(<BookClasses />, "/app/classes");
    const hoy = await screen.findByRole("tab", { name: "miércoles 23 de septiembre" });
    // Elegido (al entrar): va sobre el degradado, sin color propio, pero en negrita.
    const cifraElegida = within(hoy).getByText("23");
    expect(cifraElegida.className).toMatch(/\bfont-bold\b/);
    expect(cifraElegida.className).not.toMatch(/text-accent-strong|(?:^|\s)text-ink(?:\s|$)/);

    fireEvent.click(screen.getByRole("tab", { name: "jueves 24 de septiembre" }));
    const cifra = within(screen.getByRole("tab", { name: "miércoles 23 de septiembre" })).getByText("23");
    expect(cifra.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-accent-strong", "dark:text-accent", "font-bold"]));
    expect(cifra.className).not.toMatch(/(?:^|\s)text-ink(?:\s|$)/);

    const otro = within(screen.getByRole("tab", { name: "viernes 25 de septiembre" })).getByText("25");
    expect(otro.className).toMatch(/(?:^|\s)text-ink(?:\s|$)/);
    expect(otro.className).not.toMatch(/\bfont-bold\b|text-accent/);
  });
});
