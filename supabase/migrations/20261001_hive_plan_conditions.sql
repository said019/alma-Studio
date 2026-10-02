-- Additive HIVE conditions schema. Catalog reconciliation is an explicit dry-run/apply script.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS student_id_valid_until DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS plan_late_cancel BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS membership_benefit_redemptions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), membership_id UUID NOT NULL REFERENCES memberships(id),
 benefit TEXT NOT NULL CHECK (benefit='coffee'), redeemed_on DATE NOT NULL,
 redeemed_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION enforce_hive_membership_validity() RETURNS trigger AS $$
DECLARE p RECORD; bought DATE;
BEGIN
 SELECT * INTO p FROM plans WHERE id=NEW.plan_id;
 IF COALESCE(p.rules,'{}'::jsonb)='{}'::jsonb THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
   SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date INTO bought FROM orders WHERE id=NEW.order_id;
   bought:=COALESCE(bought,(NOW() AT TIME ZONE 'America/Mexico_City')::date);
   NEW.start_date:=bought;
   NEW.end_date:=bought + (COALESCE(p.duration_days,30)-1);
 ELSIF COALESCE((p.rules->>'extendable')::boolean,true)=false AND
   (NEW.start_date IS DISTINCT FROM OLD.start_date OR (OLD.end_date IS NOT NULL AND (NEW.end_date IS NULL OR NEW.end_date>OLD.end_date))) THEN
   RAISE EXCEPTION 'HIVE_PLAN: El paquete no admite prórrogas ni cambios de fecha de compra.';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS hive_membership_validity ON memberships;
CREATE TRIGGER hive_membership_validity BEFORE INSERT OR UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION enforce_hive_membership_validity();
CREATE OR REPLACE FUNCTION enforce_hive_booking_conditions() RETURNS trigger AS $$
DECLARE m RECORD; p RECORD; c RECORD; classcat TEXT; r JSONB; n INTEGER; lim INTEGER; guest BOOLEAN;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status='cancelled' THEN
   -- The client cancellation endpoint records whether it consumed the credit.
   -- Staff/class cancellation and leaving a waitlist must never add a penalty.
   NEW.plan_late_cancel := COALESCE(NEW.plan_late_cancel,false) AND OLD.status IN ('confirmed','checked_in','cancelled');
 END IF;
 IF NEW.membership_id IS NULL OR NEW.status NOT IN ('confirmed','waitlist','checked_in') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status='confirmed' AND NEW.status='checked_in' AND OLD.membership_id=NEW.membership_id AND OLD.class_id=NEW.class_id AND OLD.user_id=NEW.user_id THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status=NEW.status AND OLD.membership_id=NEW.membership_id AND OLD.class_id=NEW.class_id AND OLD.user_id=NEW.user_id THEN RETURN NEW; END IF;
 SELECT * INTO m FROM memberships WHERE id=NEW.membership_id FOR UPDATE;
 SELECT * INTO p FROM plans WHERE id=m.plan_id;
 r:=COALESCE(p.rules,'{}'::jsonb);
 -- Legacy plans keep their established administrative corrections.
 IF r='{}'::jsonb THEN RETURN NEW; END IF;
 SELECT * INTO c FROM classes WHERE id=NEW.class_id;
 SELECT category INTO classcat FROM class_types WHERE id=c.class_type_id;
 IF COALESCE(p.class_category,'all') NOT IN ('all','mixto') AND classcat IS DISTINCT FROM p.class_category THEN RAISE EXCEPTION 'HIVE_PLAN: El plan no incluye esta disciplina.'; END IF;
 IF m.status<>'active' OR (m.start_date IS NOT NULL AND c.date<m.start_date::date) OR (m.end_date IS NOT NULL AND c.date>m.end_date::date) THEN RAISE EXCEPTION 'HIVE_PLAN: La clase está fuera de la vigencia del paquete.' USING ERRCODE='P0001'; END IF;
 IF r ? 'allowed_weekdays' AND NOT (r->'allowed_weekdays' @> to_jsonb(ARRAY[extract(dow FROM c.date)::int])) THEN RAISE EXCEPTION 'HIVE_PLAN: El plan no permite este día.'; END IF;
 IF (r->>'booking_start_time' IS NOT NULL AND c.start_time<(r->>'booking_start_time')::time) OR (r->>'booking_end_time' IS NOT NULL AND c.start_time>(r->>'booking_end_time')::time) THEN RAISE EXCEPTION 'HIVE_PLAN: El plan no permite este horario.'; END IF;
 IF (COALESCE(p.personal_only,false) AND c.max_capacity<>1) OR (NOT COALESCE(p.personal_only,false) AND c.max_capacity=1) THEN RAISE EXCEPTION 'HIVE_PLAN: Esta sesión requiere un plan personalizado.'; END IF;
 guest:=NEW.user_id IS DISTINCT FROM m.user_id;
 IF guest THEN
   lim:=COALESCE((r->>'guest_passes')::int,0);
   IF lim=0 AND NOT COALESCE(p.is_visit_pack,false) THEN RAISE EXCEPTION 'HIVE_PLAN: Este paquete es personal e intransferible.'; END IF;
 ELSE
   IF COALESCE((r->>'requires_student_id')::boolean,false) AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND student_id_valid_until>=c.date) THEN RAISE EXCEPTION 'HIVE_PLAN: Presenta una credencial estudiantil vigente en recepción.'; END IF;
   lim:=COALESCE((r->>'daily_class_limit')::int,0);
 END IF;
 IF lim>0 AND NEW.status<>'waitlist' THEN
   SELECT COUNT(*) INTO n FROM bookings b JOIN classes bc ON bc.id=b.class_id
    WHERE b.membership_id=m.id AND b.id<>NEW.id
     AND (CASE WHEN guest THEN b.user_id IS DISTINCT FROM m.user_id ELSE b.user_id=m.user_id END)
     AND (CASE WHEN guest THEN CASE WHEN r->>'guest_pass_period'='month' THEN floor((bc.date-m.start_date::date)/30.0)=floor((c.date-m.start_date::date)/30.0) ELSE true END ELSE bc.date=c.date END)
     AND (b.status IN ('confirmed','checked_in','no_show') OR (b.status='cancelled' AND b.plan_late_cancel));
   IF n>=lim THEN RAISE EXCEPTION 'HIVE_PLAN: Se alcanzó el límite de % del plan.', CASE WHEN guest THEN 'guest pass' ELSE 'sesiones diarias' END; END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS hive_booking_conditions ON bookings;
CREATE TRIGGER hive_booking_conditions BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION enforce_hive_booking_conditions();
