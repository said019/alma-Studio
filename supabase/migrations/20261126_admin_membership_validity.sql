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
 ELSIF current_setting('hive.admin_validity_membership', true) IS DISTINCT FROM NEW.id::text AND
   COALESCE((p.rules->>'extendable')::boolean,true)=false AND
   (NEW.start_date IS DISTINCT FROM OLD.start_date OR (OLD.end_date IS NOT NULL AND (NEW.end_date IS NULL OR NEW.end_date>OLD.end_date))) THEN
   RAISE EXCEPTION 'HIVE_PLAN: El paquete no admite prórrogas ni cambios de fecha de compra.';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
