import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage } from "@/test/renderPage";
import { describeZone } from "@/design/zoneGuard";
import { ClassesCoaches } from "./ClassesCoaches";
import { Contact } from "./Contact";

describeZone([
  "src/components/landing/ClassesCoaches.tsx",
  "src/components/landing/Contact.tsx",
  "src/components/landing/SectionTitle.tsx",
]);

const TIPOS = [{ id: "t1", name: "Reformer", description: "Fuerza y control en grupo pequeño.", durationMin: 50 }];
const COACHES = [
  { id: "c1", displayName: "Ana López", specialties: ["Reformer", "Fuerza"], photoUrl: null },
  { id: "c2", displayName: "Diego", specialties: "Particular", photoUrl: "https://example.com/d.jpg" },
];
const props = { classTypes: TIPOS, coaches: COACHES, loading: false, error: false, onRetry: () => {} };

describe("clases y coaches", () => {
  it("tipos de clase con duración, y lo que distingue a HIVE", () => {
    renderPage(<ClassesCoaches {...props} />, "/");
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Reformer", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText("50 min")).toBeInTheDocument();
    expect(screen.getByText("Pilates · Café · Wellness.")).toBeInTheDocument();
  });
  it("coach sin foto: monograma; con foto: la foto", () => {
    renderPage(<ClassesCoaches {...props} />, "/");
    expect(screen.getByText("A", { selector: "[data-monograma]" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Diego" })).toHaveAttribute("src", "https://example.com/d.jpg");
    expect(screen.getByText("Reformer · Fuerza")).toBeInTheDocument();
  });
  it("error: aviso con reintento", () => {
    const onRetry = vi.fn();
    renderPage(<ClassesCoaches {...props} classTypes={[]} coaches={[]} error onRetry={onRetry} />, "/");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("error parcial: aviso y la mitad que sí cargó", () => {
    renderPage(<ClassesCoaches {...props} coaches={[]} error />, "/");
    expect(screen.getByText("No pudimos cargar las clases.")).toBeInTheDocument();
    expect(screen.getByText("Reformer", { selector: "h3" })).toBeInTheDocument();
  });
  it("reintentando tras un error: esqueleto, no el aviso", () => {
    const { container } = renderPage(<ClassesCoaches {...props} loading error />, "/");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("No pudimos cargar las clases.")).toBeNull();
  });
});

describe("contacto", () => {
  it("dirección con Cómo llegar, horario, Instagram y política; sin WhatsApp sin número", () => {
    renderPage(<Contact />, "/");
    expect(screen.getByText("Cuauhtémoc #68, Del Carmen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cómo llegar/ })).toHaveAttribute("href", "https://maps.app.goo.gl/6KvMNWPZk35siB4fA");
    expect(screen.getByText("6 AM a 9 PM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /@hive\.pilates/ })).toHaveAttribute("href", "https://www.instagram.com/hive.pilates");
    expect(screen.getByRole("link", { name: /Ver política/ })).toHaveAttribute("href", "/legal/cancelacion");
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });
});
