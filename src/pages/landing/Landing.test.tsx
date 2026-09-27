import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import fs from "fs";
import path from "path";
import api from "@/lib/api";
import { renderPage, respuestas } from "@/test/renderPage";
import Landing from "./Landing";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const PLANES = [
  { id: "t", name: "Clase muestra", price: "300.00", effectivePrice: "200.00", openingActive: true, classLimit: 1, isNonRepeatable: true, sortOrder: 0 },
  { id: "4", name: "4 clases", price: "1140.00", effectivePrice: "1080.00", openingActive: true, classLimit: 4, sortOrder: 1 },
];

afterEach(() => vi.clearAllMocks());

describe("landing de HIVE", () => {
  it("pide horario, paquetes, clases y coaches, y pinta todas las secciones", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      "/plans": { data: PLANES },
      "/class-types": { data: [{ id: "r", name: "Reformer", durationMin: 50 }] },
      "/public/instructors": { data: [{ id: "c", displayName: "Ana" }] },
      "/classes": { data: [] },
    }) as never);
    renderPage(<Landing />, "/");
    expect(await screen.findByText("4 clases")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    for (const id of ["clases", "horario", "paquetes", "contacto"]) expect(document.getElementById(id)).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "Paquetes" }).length).toBeGreaterThan(0);
    expect(vi.mocked(api.get).mock.calls.map(([u]) => String(u).split("?")[0]).sort())
      .toEqual(["/class-types", "/classes", "/plans", "/public/instructors"]);
  });
  it("sin paquetes activos: no hay sección ni liga de Paquetes", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({ "/plans": { data: [] } }) as never);
    renderPage(<Landing />, "/");
    await screen.findByText("Pronto publicamos el horario de la semana.");
    expect(document.getElementById("paquetes")).toBeNull();
    expect(screen.queryByRole("link", { name: "Paquetes" })).toBeNull();
  });
  it("mientras cargan los paquetes, la sección y su liga ya están, con esqueleto", async () => {
    const resto = respuestas({ "/classes": { data: [] } });
    vi.mocked(api.get).mockImplementation(((url: string) => (url.startsWith("/plans") ? new Promise(() => {}) : resto(url))) as never);
    renderPage(<Landing />, "/");
    await screen.findByText("Pronto publicamos el horario de la semana.");
    const paquetes = document.getElementById("paquetes");
    expect(paquetes).not.toBeNull();
    expect(paquetes!.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Paquetes" }).length).toBeGreaterThan(0);
  });
  it("si /plans falla: aviso en Paquetes y Reintentar vuelve a pedirlos", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({ "/plans": new Error("500"), "/classes": { data: [] } }) as never);
    renderPage(<Landing />, "/");
    await screen.findByText("No pudimos cargar los paquetes.");
    expect(screen.getAllByRole("link", { name: "Paquetes" }).length).toBeGreaterThan(0);
    const pedidos = () => vi.mocked(api.get).mock.calls.filter(([u]) => String(u).startsWith("/plans")).length;
    expect(pedidos()).toBe(1);
    fireEvent.click(within(document.getElementById("paquetes")!).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(pedidos()).toBe(2));
  });
  it("si falla sólo /public/instructors: aviso en Clases y coaches, y los tipos de clase siguen", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      "/class-types": { data: [{ id: "r", name: "Reformer", durationMin: 50 }] },
      "/public/instructors": new Error("500"),
    }) as never);
    renderPage(<Landing />, "/");
    await screen.findByText("No pudimos cargar las clases.");
    expect(screen.getByText("Reformer", { selector: "h3" })).toBeInTheDocument();
  });
  it("tras Reintentar, horario, clases y paquetes muestran esqueleto mientras piden de nuevo", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      "/classes": new Error("500"), "/plans": new Error("500"), "/public/instructors": new Error("500"),
    }) as never);
    renderPage(<Landing />, "/");
    const avisos = {
      horario: "No pudimos cargar el horario.", paquetes: "No pudimos cargar los paquetes.", clases: "No pudimos cargar las clases.",
    };
    for (const texto of Object.values(avisos)) await screen.findByText(texto);
    vi.mocked(api.get).mockImplementation((() => new Promise(() => {})) as never);
    for (const id of Object.keys(avisos)) {
      fireEvent.click(within(document.getElementById(id)!).getByRole("button", { name: "Reintentar" }));
    }
    for (const [id, texto] of Object.entries(avisos)) {
      await waitFor(() => expect(screen.queryByText(texto)).toBeNull());
      expect(document.getElementById(id)!.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    }
  });
  it("con IntersectionObserver real: cada sección se observa y se revela al entrar, también Paquetes", async () => {
    const observados: Element[] = [];
    class IOQueEntra {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        observados.push(el);
        this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal("IntersectionObserver", IOQueEntra);
    try {
      vi.mocked(api.get).mockImplementation(respuestas({
        "/plans": { data: PLANES },
        "/class-types": { data: [{ id: "r", name: "Reformer", durationMin: 50 }] },
        "/public/instructors": { data: [{ id: "c", displayName: "Ana" }] },
        "/classes": { data: [] },
      }) as never);
      renderPage(<Landing />, "/");
      await screen.findByText("4 clases");
      const reveals = Array.from(document.querySelectorAll("[data-reveal]"));
      expect(reveals.length).toBe(4);
      const paquetes = document.getElementById("paquetes")!.closest("[data-reveal]");
      expect(reveals).toContain(paquetes);
      for (const el of reveals) {
        expect(observados).toContain(el);
        expect(el).toHaveClass("is-visible");
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("Paquetes, que monta tarde (llega con /plans), también se revela", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      "/plans": { data: PLANES },
      "/class-types": { data: [{ id: "r", name: "Reformer", durationMin: 50 }] },
      "/public/instructors": { data: [{ id: "c", displayName: "Ana" }] },
      "/classes": { data: [] },
    }) as never);
    renderPage(<Landing />, "/");
    await screen.findByText("4 clases");
    const paquetes = document.getElementById("paquetes");
    expect(paquetes?.closest("[data-reveal]")).toHaveClass("is-visible");
    const reveals = document.querySelectorAll("[data-reveal]");
    expect(reveals.length).toBeGreaterThan(0);
    reveals.forEach((el) => expect(el).toHaveClass("is-visible"));
  });
});

const root = path.resolve(__dirname, "..", "..", "..");
const listar = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listar(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []);

describe("contenido de la landing (hereda las pruebas de la landing vieja)", () => {
  const archivos = [...listar("src/pages/landing"), ...listar("src/components/landing"), "src/lib/studio.ts"];
  const src = archivos.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  it("sin Alma, Juriquilla ni Querétaro", () => expect(src).not.toMatch(/\bAlma\b|Juriquilla|Querétaro/));
  it("sin testimonios ni fotos de Alma", () => {
    expect(src).not.toMatch(/testimoni/i);
    expect(src).not.toContain("assets/alma");
  });
  it("sin precios escritos a mano", () => expect(src).not.toMatch(/\$\s?\d{2,}|\bprice:\s*\d/));
  it("la landing vieja ya no existe", () => {
    expect(fs.existsSync(path.join(root, "src/pages/Index.tsx"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "src/App.tsx"), "utf8")).toMatch(/path="\/" element=\{<Landing \/>\}/);
  });
});
