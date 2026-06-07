/* Aplica la paleta NUDE de Alma Movement:
   - Remapeo global de hexes de marca (deja intactos colores funcionales: rojos, verdes, dorados).
   - Patch de las variables HSL de shadcn en src/index.css. */
const fs = require("fs");
const path = require("path");

// ── Paleta oficial Alma (de "colores alma.jpeg") + derivados de soporte ──
const P = {
  desertRock:    "#A48D78",
  softSandstone: "#CBB9A4",
  creamedOat:    "#E6DAC8",
  porcelainMist: "#F4F1EA",
  featherWhite:  "#FAF9F6",
  // derivados para texto/bordes (la paleta no trae oscuro legible)
  espresso:      "#43392F", // texto/ink
  taupeMuted:    "#8C7A68", // texto secundario
  oatLight:      "#F0EBE1", // muted bg
  sandBorder:    "#E0D5C6", // bordes
  oliveTaupe:    "#9C8E72", // sustituto de oliva
  warmAccent:    "#C0A688", // sustituto de naranja
};

// ── Remapeo HEX -> HEX (hexes de marca antiguos -> paleta nude de Alma) ──
const HEX_MAP = {
  "#76214D": P.desertRock,    // berry/primary
  "#E9745F": P.softSandstone, // coral
  "#F58A24": P.warmAccent,    // naranja
  "#2E201C": P.espresso,      // ink
  "#778455": P.oliveTaupe,    // oliva
  "#FFF7F2": P.featherWhite,  // cream
  "#E8CAC1": P.sandBorder,    // border
  "#FCE6E1": P.creamedOat,    // blush
  "#F3C6D6": P.creamedOat,
  "#F1D6CE": P.oatLight,
  "#F3E7E0": P.porcelainMist,
  "#F1DFD8": P.oatLight,
  "#FFF0E4": P.porcelainMist,
  "#FFF6E6": P.porcelainMist,
  "#7B5B52": P.taupeMuted,
  "#8A7A72": P.taupeMuted,
  "#3B2C26": P.espresso,
};

function hexToHslTriple(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      case b: hue = (r - g) / d + 4; break;
    }
    hue /= 6;
  }
  const H = Math.round(hue * 360);
  const S = Math.round(sat * 100);
  const L = Math.round(l * 100);
  return `${H} ${S}% ${L}%`;
}

// ── 1) Remapeo global de hexes ──
const ROOT = process.cwd();
const SKIP = new Set([".git", "node_modules", "dist", ".pgdata"]);
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json", ".webmanifest", ".md"]);
const targets = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name)); }
    else if (EXT.has(path.extname(e.name))) targets.push(path.join(dir, e.name));
  }
}
walk(path.join(ROOT, "src"));
for (const extra of ["server/emailService.js", "public/site.webmanifest", "index.html"]) {
  const p = path.join(ROOT, extra); if (fs.existsSync(p)) targets.push(p);
}

const upperKeys = Object.keys(HEX_MAP);
let hexFiles = 0, hexHits = 0;
for (const f of targets) {
  let s = fs.readFileSync(f, "utf8");
  const orig = s;
  for (const k of upperKeys) {
    const re = new RegExp(k, "gi");
    s = s.replace(re, () => { hexHits++; return HEX_MAP[k]; });
  }
  if (s !== orig) { fs.writeFileSync(f, s, "utf8"); hexFiles++; }
}

// ── 2) Patch de variables HSL de shadcn en src/index.css ──
const HSL_VARS = {
  "background": P.featherWhite,
  "foreground": P.espresso,
  "card": "#FFFFFF",
  "card-foreground": P.espresso,
  "popover": "#FFFFFF",
  "popover-foreground": P.espresso,
  "primary": P.desertRock,
  "primary-foreground": P.featherWhite,
  "secondary": P.porcelainMist,
  "secondary-foreground": P.espresso,
  "muted": P.oatLight,
  "muted-foreground": P.taupeMuted,
  "accent": P.softSandstone,
  "accent-foreground": P.espresso,
  "border": P.sandBorder,
  "input": P.sandBorder,
  "ring": P.desertRock,
  "ophelia-purple": P.espresso,
  "ophelia-magenta": P.desertRock,
  "ophelia-violet": P.oliveTaupe,
  "ophelia-lime": P.warmAccent,
  "ophelia-cream": P.featherWhite,
  "ophelia-lilac": P.softSandstone,
  "ophelia-pinklight": P.creamedOat,
  "pink-glow": P.desertRock,
};
const cssPath = path.join(ROOT, "src", "index.css");
let css = fs.readFileSync(cssPath, "utf8");
let cssHits = 0;
for (const [name, hex] of Object.entries(HSL_VARS)) {
  const triple = hexToHslTriple(hex);
  const re = new RegExp(`(--${name}:\\s*)[^;]*;`, "g");
  css = css.replace(re, (m, p1) => { cssHits++; return `${p1}${triple};`; });
}
fs.writeFileSync(cssPath, css, "utf8");

console.log(JSON.stringify({ hexFiles, hexHits, cssVarsPatched: cssHits }, null, 2));
