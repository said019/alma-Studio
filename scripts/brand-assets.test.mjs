import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { generate, TARGETS } from "./brand-assets.mjs";
import { DARK } from "../src/design/tokens.ts";
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b, tol = 10) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test("genera cada imagen con su nombre y su tamaño", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-assets-"));
  const escritos = await generate(dir);
  assert.equal(escritos.length, TARGETS.length);
  for (const t of TARGETS) {
    const meta = await sharp(path.join(dir, t.file)).metadata();
    assert.equal(meta.width, t.size, t.file);
    assert.equal(meta.height, t.size, t.file);
  }
});

test("el ícono de la app es carbón en la esquina y terracota en el hexágono", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-assets-"));
  await generate(dir);
  const { data, info } = await sharp(path.join(dir, "icon-512.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  assert.deepEqual(px(4, 4), rgbOf(DARK.canvas));
  const hx = px(286, 150);
  assert.ok(near(hx, rgbOf(DARK.accent)), `el hexágono no es terracota: ${hx}`);
});

// F2 — email-logo.png debía verse "en cualquier cliente y en modo oscuro"
// (server/emailService.js). Con bg: null (transparente) desaparece al
// componerse sobre fondos oscuros. Lleva fondo accent, opaco, como el
// ícono de la app; el correo ya lo recorta en círculo.
test("email-logo.png tiene la esquina en terracota opaca (se ve también en modo oscuro)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-assets-"));
  await generate(dir);
  const { data, info } = await sharp(path.join(dir, "email-logo.png")).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4, "debe conservar canal alfa");
  const i = (4 * info.width + 4) * info.channels;
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  assert.deepEqual([r, g, b], rgbOf(DARK.accent), "esquina terracota (accent)");
  assert.equal(a, 255, "opaco, no transparente");
});
