-- Auditoría 2026-09-08 · P0-1 y P1-6
--
-- P0-1 — Doble descuento de créditos.
--   El esquema original descontaba la clase al hacer CHECK-IN (este trigger).
--   La aplicación evolucionó a descontar al RESERVAR (consumeMembershipCredit,
--   walk-in, visitas, asignación de admin y Wellhub lo hacen explícitamente).
--   Nadie quitó el trigger, así que cada clase asistida costaba 2 créditos:
--   un paquete de 8 rendía 4. Se elimina el trigger; la app queda como única
--   dueña del débito, que ya es transaccional e idempotente.
DROP TRIGGER IF EXISTS trigger_decrement_classes ON bookings;
DROP FUNCTION IF EXISTS decrement_membership_classes();

-- P1-6 — Contador de cupo inflado.
--   trigger_update_booking_count YA mantiene classes.current_bookings en
--   INSERT/UPDATE/DELETE. Los handlers además hacían "current_bookings + 1"
--   a mano, así que cada reserva sumaba 2 y la dueña veía la ocupación al
--   doble. Se quitan los ajustes manuales del código (server/index.js) y el
--   trigger queda como único dueño. Aquí se repara el desfase acumulado.
UPDATE classes c
   SET current_bookings = COALESCE((
         SELECT COUNT(*) FROM bookings b
          WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in')
       ), 0)
 WHERE c.current_bookings IS DISTINCT FROM COALESCE((
         SELECT COUNT(*) FROM bookings b
          WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in')
       ), 0);

-- P1-3 — "Cerrar clase" llevaba muerta desde su creación: el código escribía
--   status='closed' y ese valor no existe en el enum class_status
--   (scheduled, in_progress, completed, cancelled) → 500 siempre.
--   Se añade el valor que el código ya esperaba.
ALTER TYPE class_status ADD VALUE IF NOT EXISTS 'closed';
