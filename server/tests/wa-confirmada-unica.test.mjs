// fix(hive) limpieza final bloque 3, punto 1 · POST /api/bookings mandaba el
// WhatsApp "booking_confirmed" dos veces: una por sendBookingNoticeWhatsApp
// (usa el estado final de la reserva y el template real de la dueña) y otra
// por notifyBookingConfirmed (siempre booking_confirmed, sin ver la fila).
//
// No hay forma de contar el envío real por HTTP: en la base desechable
// EVOLUTION_API_URL va vacío (regla del pool), así que sendWhatsAppNow falla
// contra Evolution y el error se traga (.catch); la ruta no expone contador
// de WhatsApp en la respuesta (a diferencia de PUT /classes/:id/cancel, que sí
// trae wa_queued/wa_unreached) y las funciones viven dentro de server/index.js
// sin exportarse, así que no se pueden interceptar desde un test que habla con
// el servidor por HTTP. Por eso esta prueba es estática sobre la fuente: fija
// que dentro del handler de POST /api/bookings sólo queda UN sitio que puede
// disparar el template booking_confirmed (sendBookingNoticeWhatsApp) y que
// notifyBookingConfirmed ya no se llama ahí.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");

const inicio = SRC.indexOf('app.post("/api/bookings", authMiddleware,');
const fin = SRC.indexOf('app.delete("/api/bookings/:id", authMiddleware,');
assert.ok(inicio > -1, "no se encontró el handler de POST /api/bookings");
assert.ok(fin > inicio, "no se encontró el final del handler (DELETE /bookings/:id)");
const HANDLER = SRC.slice(inicio, fin);

test("POST /api/bookings sólo manda booking_confirmed una vez por reserva", () => {
  const llamadasSendNotice = HANDLER.match(/sendBookingNoticeWhatsApp\(/g) || [];
  assert.equal(llamadasSendNotice.length, 1,
    "sendBookingNoticeWhatsApp debe llamarse exactamente una vez en la ruta (una por reserva)");
  assert.ok(!HANDLER.includes("notifyBookingConfirmed("),
    "notifyBookingConfirmed ya no debe llamarse aquí: duplicaba el WhatsApp de sendBookingNoticeWhatsApp");
});

test("la asignación de recepción sigue mandando su propio aviso (sin tocar)", () => {
  const asigInicio = SRC.indexOf('app.post("/api/admin/bookings/assign"');
  assert.ok(asigInicio > -1, "no se encontró la ruta de asignación");
  const asigFin = SRC.indexOf("\napp.", asigInicio + 10);
  const ASIG = SRC.slice(asigInicio, asigFin > -1 ? asigFin : undefined);
  const llamadas = ASIG.match(/sendBookingNoticeWhatsApp\(/g) || [];
  assert.equal(llamadas.length, 1, "la asignación debe seguir mandando un solo WhatsApp, como hoy");
});
