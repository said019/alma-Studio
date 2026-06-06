/* Genera todas las variantes de logo/ícono/favicon de Alma Movement
   a partir del logo oficial (brand/logo alma.jpeg). Requiere sharp. */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SRC = path.join(ROOT, "brand", "logo alma.jpeg");
const BG = "#EDE4D6";   // fondo crema del propio logo (para padding sin costura)
const PAGE = "#FAF9F6"; // fondo de la app (para og-image)

const square = (size) => sharp(SRC).resize(size, size, { fit: "cover" }).png();
// versión con margen seguro (maskable / og)
const padded = (size, inner, bg) =>
  sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: bg })
    .extend({
      top: Math.round((size - inner) / 2), bottom: Math.round((size - inner) / 2),
      left: Math.round((size - inner) / 2), right: Math.round((size - inner) / 2),
      background: bg,
    })
    .png();

const jobs = [
  // favicons / iconos PWA
  ["public/favicon-16.png", () => square(16)],
  ["public/favicon-32.png", () => square(32)],
  ["public/apple-touch-icon.png", () => square(180)],
  ["public/icon-192.png", () => square(192)],
  ["public/icon-512.png", () => square(512)],
  ["public/icon-maskable-512.png", () => padded(512, 410, BG)],
  // open graph
  ["public/og-image.png", () => padded(1200, 900, PAGE)],
  // logo de nav / wallet (cuadrado, object-contain en la UI)
  ["public/wallet-logo.png", () => square(220)],
  ["public/wallet-logo@2x.png", () => square(440)],
  ["public/wallet-logo@3x.png", () => square(660)],
  ["public/wallet-logo-black.png", () => square(220)],
  ["public/wallet-logo-black@2x.png", () => square(440)],
  ["public/wallet-logo-black@3x.png", () => square(660)],
  // assets importados por el código
  ["src/assets/alma/alma-logo.png", () => square(512)],
  ["src/assets/alma/alma-icon.png", () => square(256)],
  ["public/brand/alma-logo.png", () => square(512)],
  ["public/brand/alma-icon.png", () => square(256)],
];

(async () => {
  const done = [];
  for (const [out, make] of jobs) {
    const dest = path.join(ROOT, out);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await make().toFile(dest);
    done.push(out);
  }
  console.log("Generados " + done.length + " archivos:\n  " + done.join("\n  "));
})().catch(e => { console.error("BRAND_FAIL:", e.message); process.exit(1); });
