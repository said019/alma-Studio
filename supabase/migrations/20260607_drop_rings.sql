-- Elimina la feature de anillos (gamificación) por completo.
-- Orden seguro también en DB nueva: `DROP TRIGGER ... ON <tabla>` falla si la
-- tabla no existe (IF EXISTS solo cubre el trigger, no la tabla), así que para
-- ring_states/community_events dejamos que `DROP FUNCTION ... CASCADE` y
-- `DROP TABLE ... CASCADE` se lleven sus triggers. `bookings` siempre existe
-- (la crea schema_complete.sql antes de esta migración).
DROP TRIGGER IF EXISTS trg_bookings_recalculate_alma_rings ON bookings;
DROP FUNCTION IF EXISTS recalculate_alma_rings_on_checkin() CASCADE;
DROP FUNCTION IF EXISTS recalculate_alma_rings_on_community_event() CASCADE;
DROP FUNCTION IF EXISTS enqueue_wallet_update_from_ring_state() CASCADE;
DROP FUNCTION IF EXISTS update_ring_states_updated_at() CASCADE;
DROP TABLE IF EXISTS ring_states CASCADE;
DROP TABLE IF EXISTS community_events CASCADE;
ALTER TABLE plans DROP COLUMN IF EXISTS ring_constancia_goal;
ALTER TABLE plans DROP COLUMN IF EXISTS ring_esfuerzo_goal;
ALTER TABLE plans DROP COLUMN IF EXISTS ring_conexion_goal;
ALTER TABLE plans DROP COLUMN IF EXISTS reward_description;
