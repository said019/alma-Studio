-- Credential configuration only. No schedules are published by this migration.
CREATE TABLE IF NOT EXISTS partner_integration_config (
  provider TEXT PRIMARY KEY CHECK (provider IN ('totalpass')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_encrypted TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  connection_status TEXT NOT NULL DEFAULT 'not_tested' CHECK (connection_status IN ('not_tested','verified','failed')),
  tested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
ALTER TABLE partner_integration_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_integration_config FROM PUBLIC;
-- Operational connector state. Credentials remain in the encrypted configuration table.
ALTER TABLE partner_integration_config ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE partner_integration_config ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
ALTER TABLE partner_integration_config ADD COLUMN IF NOT EXISTS last_sync_status TEXT;
ALTER TABLE partner_integration_config ADD COLUMN IF NOT EXISTS last_sync_summary JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_provider TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_external_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_metadata JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS bookings_partner_external_unique ON bookings(partner_provider,partner_external_id) WHERE partner_provider IS NOT NULL;
CREATE TABLE IF NOT EXISTS partner_class_links (
 provider TEXT NOT NULL REFERENCES partner_integration_config(provider),
 class_id UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
 external_id TEXT,
 state TEXT NOT NULL DEFAULT 'pending',
 desired_hash TEXT,
 synced_hash TEXT,
 last_error TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(provider,class_id), UNIQUE(provider,external_id)
);
CREATE TABLE IF NOT EXISTS partner_sync_issues (
 provider TEXT NOT NULL REFERENCES partner_integration_config(provider),
 issue_key TEXT NOT NULL,
 code TEXT NOT NULL,
 detail JSONB NOT NULL DEFAULT '{}',
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 resolved_at TIMESTAMPTZ,
 PRIMARY KEY(provider,issue_key)
);
ALTER TABLE partner_class_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_sync_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_class_links,partner_sync_issues FROM PUBLIC;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='hive_booking_owner_or_totalpass') THEN
 ALTER TABLE bookings ADD CONSTRAINT hive_booking_owner_or_totalpass CHECK(user_id IS NOT NULL OR (partner_provider IS NOT DISTINCT FROM 'totalpass' AND partner_external_id IS NOT NULL)) NOT VALID;
 END IF;
END $$;
ALTER TABLE partner_class_links ADD COLUMN IF NOT EXISTS capacity_hold INTEGER NOT NULL DEFAULT 0;
-- Published channel offers are diagnostic only; only observed reservations consume inventory.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='partner_class_links'::regclass AND attname='remote_booked' AND NOT attisdropped) THEN
    ALTER TABLE partner_class_links ADD COLUMN remote_booked INTEGER NOT NULL DEFAULT 0;
    UPDATE partner_class_links l SET remote_booked=(
      SELECT COUNT(*) FROM bookings b WHERE b.class_id=l.class_id AND b.partner_provider=l.provider
        AND b.status IN ('confirmed','checked_in'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='partner_class_links'::regclass AND conname='partner_remote_booked_nonnegative') THEN
    ALTER TABLE partner_class_links ADD CONSTRAINT partner_remote_booked_nonnegative CHECK(remote_booked >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_partner_shared_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_occupancy INTEGER := 0;
  new_occupancy INTEGER := 0;
  occupied BIGINT;
  reserved BIGINT;
  capacity INTEGER;
  checked_at TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM partner_class_links WHERE class_id=NEW.class_id) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    PERFORM id FROM classes WHERE id IN (OLD.class_id, NEW.class_id) ORDER BY id FOR UPDATE;
  ELSE
    PERFORM id FROM classes WHERE id=NEW.class_id FOR UPDATE;
  END IF;
  -- Preserve real remote reservations even if an external system overbooks.
  IF NEW.partner_provider IS NOT NULL THEN RETURN NEW; END IF;
  checked_at := clock_timestamp();
  IF NEW.status IN ('confirmed','checked_in') THEN
    new_occupancy := CASE WHEN NEW.user_id IS NOT NULL AND NULLIF(NEW.guest_name,'') IS NOT NULL THEN 2 ELSE 1 END;
  END IF;
  IF TG_OP='UPDATE' AND OLD.class_id=NEW.class_id THEN
    IF OLD.status IN ('confirmed','checked_in') THEN
      old_occupancy := CASE WHEN OLD.user_id IS NOT NULL AND NULLIF(OLD.guest_name,'') IS NOT NULL THEN 2 ELSE 1 END;
    END IF;
  END IF;
  IF new_occupancy <= old_occupancy THEN RETURN NEW; END IF;
  SELECT max_capacity INTO capacity FROM classes WHERE id=NEW.class_id;
  SELECT COALESCE(SUM(CASE WHEN user_id IS NOT NULL AND NULLIF(guest_name,'') IS NOT NULL THEN 2 ELSE 1 END),0)
    INTO occupied FROM bookings WHERE class_id=NEW.class_id AND id IS DISTINCT FROM NEW.id AND
      (status IN ('confirmed','checked_in'));
  SELECT COALESCE(SUM(GREATEST(l.remote_booked - (
      SELECT COUNT(*) FROM bookings b WHERE b.class_id=l.class_id AND b.partner_provider=l.provider
        AND b.status IN ('confirmed','checked_in')
    ),0)),0) INTO reserved FROM partner_class_links l WHERE l.class_id=NEW.class_id;
  IF occupied + new_occupancy + reserved > capacity THEN
    RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='partner_shared_capacity_exceeded',
      MESSAGE='No hay cupo disponible: la clase está completa contando las reservas de las plataformas externas.';
  END IF;
  RETURN NEW;
END;
$$;

-- Revision acknowledgements preserve changes committed while a connector is working.
CREATE TABLE IF NOT EXISTS partner_sync_requests (
  provider TEXT PRIMARY KEY REFERENCES partner_integration_config(provider),
  revision BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE partner_sync_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_sync_requests FROM PUBLIC;

CREATE OR REPLACE FUNCTION queue_partner_shared_sync()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO partner_sync_requests(provider,revision,updated_at)
    SELECT provider,1,clock_timestamp() FROM partner_integration_config WHERE sync_enabled ORDER BY provider
  ON CONFLICT(provider) DO UPDATE SET revision=partner_sync_requests.revision+1,updated_at=EXCLUDED.updated_at;
  IF FOUND THEN PERFORM pg_notify('partner_capacity_changed',''); END IF;
END;
$$;
REVOKE ALL ON FUNCTION queue_partner_shared_sync() FROM PUBLIC;

CREATE OR REPLACE FUNCTION queue_partner_booking_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(OLD.class_id,OLD.status,OLD.partner_provider,
           OLD.user_id IS NOT NULL AND NULLIF(OLD.guest_name,'') IS NOT NULL,
           OLD.class_id)
       IS NOT DISTINCT FROM
       ROW(NEW.class_id,NEW.status,NEW.partner_provider,
           NEW.user_id IS NOT NULL AND NULLIF(NEW.guest_name,'') IS NOT NULL,
           NEW.class_id) THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM queue_partner_shared_sync();
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trigger_partner_booking_sync ON bookings;
CREATE TRIGGER trigger_partner_booking_sync AFTER INSERT OR UPDATE OR DELETE ON bookings
FOR EACH ROW EXECUTE FUNCTION queue_partner_booking_sync();

CREATE OR REPLACE FUNCTION queue_partner_class_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(OLD.date,OLD.start_time,OLD.end_time,OLD.max_capacity,OLD.status,OLD.instructor_id,OLD.class_type_id)
       IS NOT DISTINCT FROM ROW(NEW.date,NEW.start_time,NEW.end_time,NEW.max_capacity,NEW.status,NEW.instructor_id,NEW.class_type_id) THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM queue_partner_shared_sync();
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trigger_partner_class_sync ON classes;
CREATE TRIGGER trigger_partner_class_sync AFTER INSERT OR UPDATE OR DELETE ON classes
FOR EACH ROW EXECUTE FUNCTION queue_partner_class_sync();

CREATE OR REPLACE FUNCTION queue_partner_remote_booked_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.remote_booked=0 THEN RETURN NEW; END IF;
  ELSIF NEW.remote_booked IS NOT DISTINCT FROM OLD.remote_booked THEN
    RETURN NEW;
  END IF;
  PERFORM queue_partner_shared_sync();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_partner_remote_booked_sync ON partner_class_links;
CREATE TRIGGER trigger_partner_remote_booked_sync AFTER INSERT OR UPDATE ON partner_class_links
FOR EACH ROW EXECUTE FUNCTION queue_partner_remote_booked_sync();

DROP TRIGGER IF EXISTS trigger_partner_shared_capacity ON bookings;
CREATE TRIGGER trigger_partner_shared_capacity BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION enforce_partner_shared_capacity();
-- Class-specific ceilings do not reserve physical places or change global defaults.
CREATE TABLE IF NOT EXISTS partner_class_quotas (
 class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK (provider IN ('totalpass')),
 quota integer NOT NULL CHECK (quota >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (class_id,provider)
);
ALTER TABLE partner_class_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_class_quotas FROM PUBLIC;
CREATE TABLE IF NOT EXISTS totalpass_checkin_events (
 event_hash text PRIMARY KEY,
 unit_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('received','confirmed','matched','unmatched','rejected','uncertain')),
 identity_encrypted text,
 checkin_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
 reason text
);
CREATE INDEX IF NOT EXISTS totalpass_checkin_pending ON totalpass_checkin_events(state,received_at);
CREATE TABLE IF NOT EXISTS totalpass_checkin_registration (
 unit_id text PRIMARY KEY,
 verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE totalpass_checkin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE totalpass_checkin_registration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON totalpass_checkin_events,totalpass_checkin_registration FROM PUBLIC;

-- Review invitations belong to HIVE accounts. Imported partner seats have no
-- local recipient and must still be able to confirm their check-in.
DROP TRIGGER IF EXISTS trigger_create_review_request ON bookings;
CREATE TRIGGER trigger_create_review_request AFTER INSERT OR UPDATE ON bookings
FOR EACH ROW WHEN (NEW.user_id IS NOT NULL) EXECUTE FUNCTION create_review_request();

-- TotalPass cannot reschedule published event occurrences in-place. The local
-- calendar must not display a new time while the provider still sells the old.
CREATE OR REPLACE FUNCTION protect_totalpass_class_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.date,NEW.start_time) IS DISTINCT FROM (OLD.date,OLD.start_time)
    AND EXISTS(SELECT 1 FROM partner_class_links WHERE class_id=NEW.id AND provider='totalpass') THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='totalpass_linked_class_time',
     MESSAGE='TotalPass no permite reprogramar esta clase publicada. Cancela la clase y crea otra con el nuevo horario.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS totalpass_class_time_guard ON classes;
CREATE TRIGGER totalpass_class_time_guard BEFORE UPDATE OF date,start_time ON classes
FOR EACH ROW EXECUTE FUNCTION protect_totalpass_class_time();
