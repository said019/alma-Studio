import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { COLOR } from "./tokens";

const root = path.resolve(__dirname, "..", "..");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

/** "60 4% 95%" → #RRGGBB */
function hslToHex(triplet: string): string {
  const [h, s, l] = triplet.trim().split(/\s+/).map((v) => parseFloat(v));
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function cssVar(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`Falta --${name} en index.css`);
  return m[1].replace(/\/\*.*?\*\//g, "").trim();
}
const cercano = (a: string, b: string) =>
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);

describe("cableado de tokens", () => {
  const esperado: Record<string, string> = {
    background: COLOR.canvas, foreground: COLOR.ink,
    card: COLOR.surface, "card-foreground": COLOR.ink,
    popover: COLOR.surface, "popover-foreground": COLOR.ink,
    primary: COLOR.ink, "primary-foreground": COLOR.canvas,
    secondary: COLOR.sunken, "secondary-foreground": COLOR.ink,
    muted: COLOR.sunken, "muted-foreground": COLOR.inkMuted,
    destructive: COLOR.danger, "destructive-foreground": COLOR.canvas,
    border: COLOR.line, input: COLOR.lineStrong, ring: COLOR.ink,
  };
  it.each(Object.entries(esperado))("--%s coincide con su token", (variable, hex) => {
    expect(cercano(hslToHex(cssVar(variable)), hex), `--${variable}`).toBe(true);
  });

  it("shadcn ya no define --accent: ese nombre ahora es el coral", () => {
    expect(css).not.toMatch(/--accent(-foreground)?:/);
  });

  it("los componentes shadcn no usan accent para hover, foco ni selección", () => {
    const dir = path.join(root, "src/components/ui");
    const conProblema = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => {
        const src = fs.readFileSync(path.join(dir, f), "utf8");
        return /:bg-accent(\/\d+)?(?![\w-])/.test(src) || /\btext-accent-foreground\b/.test(src);
      });
    expect(conProblema).toEqual([]);
  });

  it("index.html carga Unbounded y Manrope, y ya no Fraunces ni Jost", () => {
    expect(html).toMatch(/family=Unbounded/);
    expect(html).toMatch(/family=Manrope/);
    expect(html).not.toMatch(/Fraunces|Jost/);
    // F7 — la barra superior móvil ahora es surface (antes canvas).
    expect(html).toContain('content="#FFFFFF"');
  });

  it("F7 — theme-color/status bar: surface arriba, canvas en TileColor y manifest", () => {
    expect(html).toMatch(/name="theme-color" content="#FFFFFF"/);
    expect(html).toMatch(/name="msapplication-TileColor" content="#F4F4F3"/);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/site.webmanifest"), "utf8"));
    expect(manifest.theme_color).toBe("#FFFFFF");
    expect(manifest.background_color).toBe("#F4F4F3");
  });

  it("el cuerpo usa Manrope y los titulares Unbounded", () => {
    expect(css).toMatch(/body\s*\{[^}]*'Manrope'/);
    expect(css).toMatch(/h1, h2, h3, h4, h5, h6\s*\{[^}]*'Unbounded'/);
  });
});
