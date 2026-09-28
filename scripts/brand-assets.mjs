// Genera favicon, íconos de la app, logo de correo y logos del pase de wallet
// desde el SVG provisional (spec §5). Uso: npm run brand:assets
// Los nombres de archivo se conservan: el servidor los lee por nombre.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { DARK, LIGHT } from "../src/design/tokens.ts";

const svgPath = new URL("../src/assets/brand/hive-mark.svg", import.meta.url);

/** fg: color del símbolo · bg: fondo (null = transparente) · pad: margen relativo.
 *  Spec 2026-09-25 §8: ícono y favicon = hexágono terracota sobre el carbón de la app. */
export const TARGETS = [
  { file: "favicon-16.png", size: 16, fg: DARK.accent, bg: DARK.canvas, pad: 0.1 },
  { file: "favicon-32.png", size: 32, fg: DARK.accent, bg: DARK.canvas, pad: 0.12 },
  { file: "apple-touch-icon.png", size: 180, fg: DARK.accent, bg: DARK.canvas, pad: 0.18 },
  { file: "icon-192.png", size: 192, fg: DARK.accent, bg: DARK.canvas, pad: 0.18 },
  { file: "icon-512.png", size: 512, fg: DARK.accent, bg: DARK.canvas, pad: 0.18 },
  { file: "icon-maskable-512.png", size: 512, fg: DARK.accent, bg: DARK.canvas, pad: 0.28 },
  // Círculo terracota opaco: se ve en correo claro y oscuro (el correo lo recorta en círculo).
  { file: "email-logo.png", size: 240, fg: DARK.onAccent, bg: DARK.accent, pad: 0.18 },
  { file: "alma-mark-light.png", size: 512, fg: DARK.accent, bg: null, pad: 0.06 }, // "light" = para fondos oscuros
  // Isotipo de los correos: terracota sobre transparente, sin margen, a 3× de
  // los 40×46 con que lo pinta server/emailService.js en la banda carbón.
  { file: "email/hive-mark.png", width: 120, height: 138, fg: DARK.accent, bg: null, pad: 0 },
  ...[1, 2, 3].flatMap((k) => [
    { file: `wallet-logo${k > 1 ? `@${k}x` : ""}.png`, size: 220 * k, fg: LIGHT.ink, bg: LIGHT.canvas, pad: 0.14 },
    { file: `wallet-logo-black${k > 1 ? `@${k}x` : ""}.png`, size: 220 * k, fg: DARK.accent, bg: DARK.canvas, pad: 0.14 },
    ...["pilates", "jumping", "mixto", "event"].map((cat) => ({
      file: `wallet-icon-${cat}${k > 1 ? `@${k}x` : ""}.png`, size: 29 * k, fg: DARK.onAccent, bg: DARK.accent, pad: 0.12,
    })),
  ]),
  { file: "og-image.png", width: 1200, height: 630, fg: DARK.accent, bg: DARK.canvas, pad: 0.22 },
];

async function render({ size, width = size, height = size, fg, bg, pad }) {
  const svg = fs.readFileSync(svgPath, "utf8").replace(/currentColor/g, fg);
  // Caja interior con el margen aplicado; el símbolo cabe con "contain". En los
  // cuadrados y en og-image (limitado por la altura) da lo mismo que una caja
  // cuadrada; en un lienzo con la proporción del símbolo lo llena sin márgenes.
  const innerW = Math.round(width - Math.min(width, height) * pad * 2);
  const innerH = Math.round(height - Math.min(width, height) * pad * 2);
  const mark = await sharp(Buffer.from(svg), { density: 384 })
    .resize({ height: innerH, width: innerW, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const base = sharp({
    create: {
      width, height, channels: 4,
      background: bg ? { r: parseInt(bg.slice(1, 3), 16), g: parseInt(bg.slice(3, 5), 16), b: parseInt(bg.slice(5, 7), 16), alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  return base.composite([{ input: mark, gravity: "center" }]).png().toBuffer();
}

export async function generate(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const t of TARGETS) {
    fs.mkdirSync(path.dirname(path.join(outDir, t.file)), { recursive: true });
    fs.writeFileSync(path.join(outDir, t.file), await render(t));
    written.push(t.file);
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = path.resolve(fileURLToPath(new URL("..", import.meta.url)), "public");
  generate(out).then((f) => console.log(`✓ ${f.length} imágenes en public/`));
}
