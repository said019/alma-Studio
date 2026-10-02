import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "@/test/renderPage";
import { describeZone } from "@/design/zoneGuard";
import { ClassesCoaches } from "./ClassesCoaches";
import { Contact } from "./Contact";

describeZone([
  "src/components/landing/ClassesCoaches.tsx",
  "src/components/landing/Contact.tsx",
  "src/components/landing/SectionTitle.tsx",
]);

describe("oferta editorial de HIVE", () => {
  it("presenta sólo Pilates Reformer con condiciones verificadas", () => {
    renderPage(<ClassesCoaches />, "/");
    expect(screen.getByRole("heading", {name:"Pilates Reformer. En HIVE."})).toBeInTheDocument();
    expect(screen.getByText(/Una sesión, paquetes de 4, 10 o 20 clases y membresías/)).toBeInTheDocument();
    expect(screen.getByText(/personalizadas de lunes a viernes, de 11 am a 4 pm/)).toBeInTheDocument();
    expect(screen.queryByText(/Barre|Sculpt|Pilates Mat|Pilates Tower/)).toBeNull();
    expect(screen.queryByText("Nuestro equipo.")).toBeNull();
    expect(screen.getByRole("img", {name:/Detalle ilustrativo/})).toHaveAttribute("src", "/hive/reformer-detail.webp");
    expect(screen.getByText("Imagen ilustrativa de un Reformer.")).toBeInTheDocument();
  });
  it("enlaza a compra aunque la landing no tenga paquetes publicados", () => {
    renderPage(<ClassesCoaches />, "/");
    expect(screen.getByRole("link", {name:/Ver opciones de plan/})).toHaveAttribute("href","/app/checkout");
  });
});

describe("contacto", () => {
  it("dirección con Cómo llegar, horario, Instagram y política; WhatsApp confirmado", () => {
    renderPage(<Contact />, "/");
    expect(screen.getByText("Cuauhtémoc #68, Del Carmen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cómo llegar/ })).toHaveAttribute("href", "https://maps.app.goo.gl/6KvMNWPZk35siB4fA");
    expect(screen.getByText(/Lun–vie: 6–10 am y 5–8 pm/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /@hive\.pilates/ })).toHaveAttribute("href", "https://www.instagram.com/hive.pilates");
    expect(screen.getByRole("link", { name: /Ver política/ })).toHaveAttribute("href", "/legal/cancelacion");
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/525559449611?text=Hola%2C%20quiero%20conocer%20HIVE.");
  });
});
