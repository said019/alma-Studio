import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { canSeeFinance, roleLabel } from "@/lib/roles";
import { waLink } from "@/lib/phone";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { AdminPageHeader } from "./AdminPage";
import KpiStrip from "./KpiStrip";
import SeatMeter from "./SeatMeter";
import StatusDot from "./StatusDot";
import PersonCell, { initials } from "./PersonCell";
import MasterDetail from "./MasterDetail";
import WeekNav from "./WeekNav";
import DayStrip from "./DayStrip";
import SaveBar from "./SaveBar";
import SectionTabs from "./SectionTabs";
import { LocationProbe } from "@/test/admin-harness";

describe("roles", () => {
  it("sólo dueña y súper admin ven dinero", () => {
    expect(canSeeFinance("admin")).toBe(true);
    expect(canSeeFinance("super_admin")).toBe(true);
    expect(canSeeFinance("reception")).toBe(false);
    expect(canSeeFinance("instructor")).toBe(false);
    expect(canSeeFinance(undefined)).toBe(false);
  });
  it("nombra el rol en español", () => {
    expect(roleLabel("admin")).toBe("Dueña");
    expect(roleLabel("reception")).toBe("Recepción");
    expect(roleLabel("instructor")).toBe("Coach");
    expect(roleLabel("otro")).toBe("Equipo");
  });
});

describe("waLink", () => {
  it("antepone 52 a un número de 10 dígitos y limpia símbolos", () => {
    expect(waLink("55 1234-5678")).toBe("https://wa.me/525512345678");
    expect(waLink("+52 55 1234 5678")).toBe("https://wa.me/525512345678");
  });
  it("sin teléfono no hay enlace", () => {
    expect(waLink("")).toBeNull();
    expect(waLink(null)).toBeNull();
    expect(waLink("123")).toBeNull();
  });
});

describe("SeatMeter", () => {
  it("un segmento por lugar y anuncia cuando está llena", () => {
    render(<SeatMeter booked={8} capacity={8} />);
    expect(screen.getByRole("img", { name: "8 de 8 lugares · llena" }).children).toHaveLength(8);
  });
  it("sobrecupo: no truena, llena todo y dice la cifra real", () => {
    render(<SeatMeter booked={9} capacity={8} />);
    expect(screen.getByRole("img", { name: "9 de 8 lugares · llena" }).children).toHaveLength(8);
  });
  it("cupo 0 o inválido no dibuja segmentos", () => {
    render(<SeatMeter booked={3} capacity={0} />);
    expect(screen.getByRole("img", { name: "Sin cupo definido" })).toBeInTheDocument();
  });
  it("con más de 12 lugares usa una barra", () => {
    render(<SeatMeter booked={10} capacity={20} />);
    const m = screen.getByRole("img", { name: "10 de 20 lugares" });
    expect(m.children).toHaveLength(1);
    expect((m.firstElementChild as HTMLElement).style.width).toBe("50%");
  });
});

describe("StatusDot", () => {
  it("siempre lleva la palabra", () => {
    render(<StatusDot tone="success">Activa</StatusDot>);
    expect(screen.getByText("Activa")).toHaveClass("text-success");
  });
  it("un tono desconocido cae a gris", () => {
    render(<StatusDot tone={"raro" as never}>X</StatusDot>);
    expect(screen.getByText("X")).toHaveClass("text-ink-muted");
  });
});

describe("PersonCell", () => {
  it("iniciales de hasta dos palabras", () => {
    expect(initials("maría fernanda garza")).toBe("MF");
    expect(initials("  ")).toBe("?");
    expect(initials(null)).toBe("?");
  });
  it("un nombre largo se corta en vez de empujar la fila", () => {
    const largo = "María Fernanda de la Garza Villarreal Montemayor";
    render(<PersonCell name={largo} sub="maria@correo.com" />);
    expect(screen.getByText(largo)).toHaveClass("truncate");
    expect(screen.getByText(largo).closest("span.min-w-0")).not.toBeNull();
  });
});

describe("AdminPageHeader y KpiStrip", () => {
  it("encabezado con etiqueta, título y acciones", () => {
    render(<AdminPageHeader kicker="Reservas · semana 39" title="Reservas" actions={<button>Nueva</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Reservas" })).toBeInTheDocument();
    expect(screen.getByText("Reservas · semana 39")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva" })).toBeInTheDocument();
  });
  it("cada cifra con su etiqueta", () => {
    render(<KpiStrip items={[{ label: "Reservas hoy", value: "49", hint: "de 66 lugares" }, { label: "Activas", value: "112" }]} />);
    expect(screen.getByText("Reservas hoy")).toBeInTheDocument();
    expect(screen.getByText("49")).toHaveClass("nums");
    expect(screen.getByText("de 66 lugares")).toBeInTheDocument();
  });
});

describe("MasterDetail", () => {
  it("con algo elegido, en angosto se ve el detalle con Volver", () => {
    const onBack = vi.fn();
    render(<MasterDetail list={<p>lista</p>} detail={<p>detalle</p>} hasSelection onBack={onBack} />);
    expect(screen.getByText("lista").parentElement).toHaveClass("hidden", "lg:block");
    fireEvent.click(screen.getByRole("button", { name: "Volver a la lista" }));
    expect(onBack).toHaveBeenCalled();
  });
  it("sin nada elegido, en angosto se ve la lista", () => {
    render(<MasterDetail list={<p>lista</p>} detail={<p>detalle</p>} hasSelection={false} onBack={() => {}} />);
    expect(screen.getByText("detalle").parentElement).toHaveClass("hidden", "lg:block");
    expect(screen.queryByRole("button", { name: "Volver a la lista" })).toBeNull();
  });
});

function ParamProbe() {
  const [clase, setClase] = useSearchParamState("clase");
  return (
    <>
      <span>clase={clase ?? "ninguna"}</span>
      <button onClick={() => setClase("c2")}>elegir</button>
      <button onClick={() => setClase(null)}>quitar</button>
      <LocationProbe />
    </>
  );
}

describe("useSearchParamState", () => {
  it("lee y escribe un parámetro sin tocar los demás", () => {
    render(<MemoryRouter initialEntries={["/admin/bookings?clase=c1&x=1"]}><ParamProbe /></MemoryRouter>);
    expect(screen.getByText("clase=c1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("elegir"));
    expect(screen.getByTestId("location").textContent).toBe("/admin/bookings?clase=c2&x=1");
    fireEvent.click(screen.getByText("quitar"));
    expect(screen.getByTestId("location").textContent).toBe("/admin/bookings?x=1");
  });
});

describe("WeekNav y DayStrip", () => {
  it("mueve la semana de 7 en 7 días", () => {
    const onChange = vi.fn();
    render(<WeekNav weekStart={new Date(2026, 8, 21)} onChange={onChange} />);
    expect(screen.getByText("21 sep – 27 sep 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(onChange.mock.calls[0][0].getDate()).toBe(28);
  });
  it("marca el día elegido y avisa al tocar otro", () => {
    const onChange = vi.fn();
    const days = [21, 22].map((d) => ({ date: `2026-09-${d}`, label: d === 21 ? "LUN" : "MAR", day: d, count: 3 }));
    render(<DayStrip days={days} value="2026-09-21" onChange={onChange} today="2026-09-22" />);
    expect(screen.getByRole("button", { name: /LUN 21/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /MAR 22/ }));
    expect(onChange).toHaveBeenCalledWith("2026-09-22");
  });
});

describe("SaveBar", () => {
  it("sólo aparece con cambios y llama a guardar o descartar", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const { rerender } = render(<SaveBar dirty={false} onSave={onSave} onDiscard={onDiscard} />);
    expect(screen.queryByText("Tienes cambios sin guardar")).toBeNull();
    rerender(<SaveBar dirty onSave={onSave} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onSave).toHaveBeenCalled();
    expect(onDiscard).toHaveBeenCalled();
  });
});

describe("SectionTabs", () => {
  it("una pestaña exacta no se marca en sus sub-rutas y el contador va sobre coral", () => {
    render(
      <MemoryRouter initialEntries={["/admin/bookings/waitlist"]}>
        <SectionTabs aria-label="Secciones de Reservas" tabs={[
          { label: "Semana", to: "/admin/bookings", exact: true },
          { label: "Lista de espera", to: "/admin/bookings/waitlist", count: 6 },
        ]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Secciones de Reservas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Semana" })).not.toHaveAttribute("aria-current");
    const espera = screen.getByRole("link", { name: /Lista de espera/ });
    expect(espera).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("6")).toHaveClass("bg-accent", "text-ink");
  });
});
