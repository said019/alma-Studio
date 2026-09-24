// Genera favicon, íconos de la app, logo de correo y logos del pase de wallet
// desde el SVG provisional (spec §5). Uso: npm run brand:assets
// Los nombres de archivo se conservan: el servidor los lee por nombre.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { COLOR } from "../src/design/tokens.ts";

const svgPath = new URL("../src/assets/brand/hive-mark.svg", import.meta.url);

/** fg: color del símbolo · bg: fondo (null = transparente) · pad: margen relativo. */
export const TARGETS = [
  { file: "favicon-16.png", size: 16, fg: COLOR.ink, bg: COLOR.accent, pad: 0.1 },
  { file: "favicon-32.png", size: 32, fg: COLOR.ink, bg: COLOR.accent, pad: 0.12 },
  { file: "apple-touch-icon.png", size: 180, fg: COLOR.ink, bg: COLOR.accent, pad: 0.18 },
  { file: "icon-192.png", size: 192, fg: COLOR.ink, bg: COLOR.accent, pad: 0.18 },
  { file: "icon-512.png", size: 512, fg: COLOR.ink, bg: COLOR.accent, pad: 0.18 },
  { file: "icon-maskable-512.png", size: 512, fg: COLOR.ink, bg: COLOR.accent, pad: 0.28 },
  { file: "email-logo.png", size: 240, fg: COLOR.ink, bg: null, pad: 0.06 },
  { file: "alma-mark-light.png", size: 512, fg: COLOR.accent, bg: null, pad: 0.06 }, // "light" = para fondos oscuros
  ...[1, 2, 3].flatMap((k) => [
    { file: `wallet-logo${k > 1 ? `@${k}x` : ""}.png`, size: 220 * k, fg: COLOR.ink, bg: COLOR.canvas, pad: 0.14 },
    { file: `wallet-logo-black${k > 1 ? `@${k}x` : ""}.png`, size: 220 * k, fg: COLOR.accent, bg: COLOR.inverse, pad: 0.14 },
    ...["pilates", "jumping", "mixto", "event"].map((cat) => ({
      file: `wallet-icon-${cat}${k > 1 ? `@${k}x` : ""}.png`, size: 29 * k, fg: COLOR.ink, bg: COLOR.accent, pad: 0.12,
    })),
  ]),
];

async function render({ size, fg, bg, pad }) {
  const svg = fs.readFileSync(svgPath, "utf8").replace(/currentColor/g, fg);
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await sharp(Buffer.from(svg), { density: 384 })
    .resize({ height: inner, width: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const base = sharp({
    create: {
      width: size, height: size, channels: 4,
      background: bg ? { r: parseInt(bg.slice(1, 3), 16), g: parseInt(bg.slice(3, 5), 16), b: parseInt(bg.slice(5, 7), 16), alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  return base.composite([{ input: mark, gravity: "center" }]).png().toBuffer();
}

export async function generate(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const t of TARGETS) {
    fs.writeFileSync(path.join(outDir, t.file), await render(t));
    written.push(t.file);
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = path.resolve(fileURLToPath(new URL("..", import.meta.url)), "public");
  generate(out).then((f) => console.log(`✓ ${f.length} imágenes en public/`));
}
