import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
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
