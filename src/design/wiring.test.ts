import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { LIGHT, DARK, THEMES, cssVarName, type ColorToken, type Theme } from "./tokens";

const root = path.resolve(__dirname, "..", "..");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const tw = fs.readFileSync(path.join(root, "tailwind.config.ts"), "utf8");

/** Cuerpo del bloque de variables de un tema. */
function block(theme: Theme): string {
  // index.css tiene otro `:root {` antes (curvas de movimiento): se busca el selector del tema.
  const sel = theme === "light" ? '[data-theme="light"]' : '[data-theme="dark"]';
  const i = css.indexOf(`${sel} {`);
  if (i < 0) throw new Error(`falta el bloque ${sel} en index.css`);
  return css.slice(i, css.indexOf("}", i));
}
const varIn = (b: string, name: string) => {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(b);
  if (!m) throw new Error(`falta ${name}`);
  return m[1].replace(/\/\*.*?\*\//g, "").trim();
};
const rgbTriplet = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
function hslToHex(t: string): string {
  const [h, s, l] = t.trim().split(/\s+/).map((v) => parseFloat(v));
  const S = s / 100, L = l / 100, k = (n: number) => (n + h / 30) % 12, a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const cercano = (a: string, b: string) =>
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);

describe.each(["light", "dark"] as Theme[])("variables del tema %s", (theme) => {
  const b = block(theme);
  const T = THEMES[theme];
  it.each(Object.keys(LIGHT) as ColorToken[])("%s coincide con su tabla", (t) => {
    expect(varIn(b, cssVarName(t))).toBe(rgbTriplet(T[t]));
  });
  const shadcn: Record<string, ColorToken> = {
    "--background": "canvas", "--foreground": "ink", "--card": "surface", "--card-foreground": "ink",
    "--popover": "surface", "--popover-foreground": "ink", "--primary": "ink", "--primary-foreground": "canvas",
    "--secondary": "sunken", "--secondary-foreground": "ink", "--muted": "sunken", "--muted-foreground": "inkMuted",
    "--destructive": "danger", "--destructive-foreground": "canvas", "--border": "line", "--input": "lineStrong", "--ring": "ink",
  };
  it.each(Object.entries(shadcn))("shadcn %s = %s", (v, t) => {
    expect(cercano(hslToHex(varIn(b, v)), T[t]), `${v}`).toBe(true);
  });
  it(`color-scheme es ${theme}`, () => {
    expect(varIn(b, "color-scheme")).toBe(theme);
  });
});

describe("cableado", () => {
  it("shadcn no define --accent: ese nombre es la terracota", () => {
    expect(css).not.toMatch(/--accent(-foreground)?:/);
  });
  it("Tailwind lee cada color por variable y activa dark: con data-theme", () => {
    expect(tw).toMatch(/darkMode:\s*\["selector",\s*'\[data-theme="dark"\]'\]/);
    expect(tw).not.toMatch(/#[0-9A-Fa-f]{6}/);
    for (const t of Object.keys(LIGHT) as ColorToken[]) {
      const name = cssVarName(t).slice(4); // sin "--c-"
      expect(tw, name).toContain(`v("${name}")`);
    }
  });
  it("los componentes shadcn no usan accent para hover, foco ni selección", () => {
    const dir = path.join(root, "src/components/ui");
    const mal = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx")).filter((f) => {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      return /:bg-accent(\/\d+)?(?![\w-])/.test(src) || /\btext-accent-foreground\b/.test(src);
    });
    expect(mal).toEqual([]);
  });
  it("index.html fija el tema por ruta antes de que cargue React", () => {
    const i = html.indexOf('name="theme-color"');
    const s = html.indexOf("<script>");
    expect(i).toBeGreaterThan(0);
    expect(s).toBeGreaterThan(i);
    const script = html.slice(s, html.indexOf("</script>", s));
    expect(script).toContain("/^\\/(app|auth)(\\/|$)/");
    expect(script).toContain("dataset.theme");
    expect(script).toContain(DARK.canvas);
  });
  it("fuentes, barra de estado y manifest", () => {
    expect(html).toMatch(/family=Unbounded/);
    expect(html).toMatch(/family=Manrope/);
    expect(html).toMatch(/name="theme-color" content="#FFFFFF"/);
    expect(html).toMatch(/name="msapplication-TileColor" content="#F2EFEA"/);
    expect(html).toMatch(/name="apple-mobile-web-app-status-bar-style" content="black"/);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/site.webmanifest"), "utf8"));
    expect(manifest.theme_color).toBe(DARK.canvas);
    expect(manifest.background_color).toBe(DARK.canvas);
  });
  it("el cuerpo usa Manrope y los titulares Unbounded", () => {
    expect(css).toMatch(/body\s*\{[^}]*'Manrope'/);
    expect(css).toMatch(/h1, h2, h3, h4, h5, h6\s*\{[^}]*'Unbounded'/);
  });
});
