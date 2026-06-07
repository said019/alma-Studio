-- Elimina la feature de anillos (gamificación) por completo.
DROP TRIGGER IF EXISTS trg_bookings_recalculate_alma_rings ON bookings;
DROP TRIGGER IF EXISTS trg_community_events_recalculate_alma_rings ON community_events;
DROP TRIGGER IF EXISTS trg_ring_states_wallet_queue ON ring_states;
DROP TRIGGER IF EXISTS trg_ring_states_updated_at ON ring_states;
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
