import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { generate, TARGETS } from "./brand-assets.mjs";

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

test("el ícono de la app es coral en la esquina y negro en el centro", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-assets-"));
  await generate(dir);
  const { data, info } = await sharp(path.join(dir, "icon-512.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  assert.deepEqual(px(4, 4), [0xfa, 0x93, 0x6a]);   // coral
  // Parte alta del hexágono, a la derecha del eje (el eje central es un corte).
  const [r, g, b] = px(286, 150);
  assert.ok(r < 40 && g < 40 && b < 40, `el hexágono no es negro: ${[r, g, b]}`);
});
