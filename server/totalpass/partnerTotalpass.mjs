const HOST = 'https://booking-api.totalpass.com';
const DAY = 86400000;
const fail = (code) => Object.assign(new Error(`TotalPass: ${code}`), { code: `TOTALPASS_${code}` });
const civil = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const hour = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function dateTime(value, fallback) {
  const date = String(value || '').slice(0, 10);
  let time = String(value || '').slice(11, 16);
  if (!hour(time)) {
    const m = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(String(fallback || ''));
    if (!m || +m[1] < 1 || +m[1] > 12) throw fail('INVALID_TIME');
    time = `${String((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)).padStart(2, '0')}:${m[2]}`;
  }
  if (!civil(date)) throw fail('INVALID_DATE');
  return { date, time };
}
function ampm(time) {
  if (!hour(time)) throw fail('INVALID_TIME');
  const h = +time.slice(0, 2);
  return `${String(h % 12 || 12).padStart(2, '0')}:${time.slice(3)} ${h >= 12 ? 'PM' : 'AM'}`;
}
function details(local, hours) {
  if (!civil(local.date) || !hour(local.time) || !local.title || !Number.isInteger(local.duration) || local.duration < 1) throw fail('INVALID_CLASS');
  if (!Number.isFinite(hours) || hours < 0 || hours > 168) throw fail('INVALID_CANCELLATION_HOURS');
  // Provider dates are civil Mexico City times, even when the response contains Z.
  const deadline = new Date(Date.parse(`${local.date}T${local.time}:00Z`) - hours * 3600000).toISOString();
  return { title: local.title, responsible: local.coach || 'Equipo HIVE', duration: local.duration,
    description: local.description || local.title,
    maxTimeToCancel: `${deadline.slice(0, 10)} ${ampm(deadline.slice(11, 16))}` };
}

export function createTotalpassAdapter({ credentials, unitId, request = globalThis.fetch }) {
  if (!credentials?.partnerApiKey || !credentials?.placeApiKey || !unitId) throw fail('CONFIGURATION_REQUIRED');
  async function call(path, token, method = 'GET', body) {
    let response;
    try {
      response = await request(`${HOST}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw fail('NETWORK_ERROR'); }
    if (!response.ok) throw fail(`HTTP_${Number(response.status) || 0}`);
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw fail('INVALID_RESPONSE'); }
  }
  async function session() {
    const auth = await call('/partner/auth', null, 'POST', { partner_api_key: credentials.partnerApiKey, place_api_key: credentials.placeApiKey });
    if (typeof auth?.token !== 'string' || !auth.token) throw fail('INVALID_AUTH');
    const place = await call('/partner/plans', auth.token);
    if (String(place?.identifier || '') !== String(unitId)) throw fail('UNIT_MISMATCH');
    return { token: auth.token, place };
  }
  async function pages(path, token, key) {
    const rows = [], seen = new Set();
    let next = path;
    for (let i = 0; i < 1000; i++) {
      if (seen.has(next)) return { rows, complete: false };
      seen.add(next);
      const body = await call(next, token);
      if (Array.isArray(body)) return { rows: rows.concat(body), complete: true };
      const items = body?.[key] ?? body?.data ?? body?.items;
      if (!Array.isArray(items)) return { rows, complete: false };
      rows.push(...items);
      const meta = body.pagination ?? body.meta ?? body;
      const nextValue = meta.next ?? meta.nextPage ?? meta.next_page;
      if (nextValue != null && nextValue !== false && nextValue !== '') {
        const url = new URL(next, HOST);
        if (typeof nextValue === 'number' || /^\d+$/.test(String(nextValue))) url.searchParams.set('page', String(nextValue));
        else {
          const target = new URL(String(nextValue), HOST);
          if (target.origin !== HOST || target.pathname !== new URL(path, HOST).pathname) return { rows, complete: false };
          url.search = target.search;
          // Pagination cannot widen/change the requested date range.
          for (const [name, value] of new URL(path, HOST).searchParams) url.searchParams.set(name, value);
        }
        next = url.pathname + url.search;
        continue;
      }
      const page = Number(meta.page ?? meta.currentPage), totalPages = Number(meta.totalPages ?? meta.total_pages);
      if (Number.isInteger(page) && Number.isInteger(totalPages) && page < totalPages) {
        const url = new URL(next, HOST); url.searchParams.set('page', String(page + 1)); next = url.pathname + url.search; continue;
      }
      const total = meta.total ?? meta.totalCount;
      if (total != null) return { rows, complete: Number(total) === rows.length };
      return { rows, complete: meta.hasMore === false || meta.hasNextPage === false || (page >= 1 && page === totalPages) };
    }
    return { rows, complete: false };
  }
  async function classes(token) {
    const result = await pages('/partner/events', token, 'events');
    const normalized = [], ids = new Set();
    for (const event of result.rows) {
      if (!Array.isArray(event?.EventOccurrences)) { result.complete = false; continue; }
      for (const occ of event.EventOccurrences) {
        try {
          const id = occ.eventOccurrenceUuid ?? occ.occurrenceUuid;
          if (!id || ids.has(String(id))) throw fail('INVALID_OCCURRENCE');
          const parsed = dateTime(occ.eventDate, occ.startTime);
          const numericCount = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
            && Number.isFinite(Number(value)) && Number.isInteger(Number(value)) && Number(value) >= 0;
          if (!numericCount(occ.slots) || !numericCount(occ.slotsInUse)) throw fail('INVALID_CAPACITY');
          const capacity = Number(occ.slots), booked = Number(occ.slotsInUse);
          ids.add(String(id));
          normalized.push({ externalId: String(id), title: String(occ.title ?? event.title ?? ''), ...parsed,
            duration: Number(occ.duration ?? event.duration), coach: String(occ.responsible ?? event.responsible ?? ''), capacity, booked,
            metadata: { unitId: String(unitId), eventId: event.id, externalReference: occ.externalReference ?? event.externalReference ?? null, status: occ.status ?? event.status ?? null } });
        } catch { result.complete = false; }
      }
    }
    return { classes: normalized, complete: result.complete };
  }
  async function exact(token, external) {
    if (!external?.externalId) throw fail('OCCURRENCE_REQUIRED');
    const snapshot = await classes(token);
    if (!snapshot.complete) throw fail('INCOMPLETE_CATALOG');
    const found = snapshot.classes.find(c => c.externalId === String(external.externalId));
    if (!found) throw fail('OCCURRENCE_NOT_FOUND');
    return found;
  }
  return {
    async catalog({ from, to }) {
      if (!civil(from) || !civil(to) || from > to) throw fail('INVALID_RANGE');
      const { token } = await session(), snapshot = await classes(token);
      const bookings = [], issues = [], ids = new Set(); let complete = snapshot.complete;
      for (let start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); start <= end; start += 30 * DAY) {
        const query = new URLSearchParams({ slotDateFrom: new Date(start).toISOString().slice(0, 10), slotDateTo: new Date(Math.min(end, start + 29 * DAY)).toISOString().slice(0, 10) });
        const slots = await pages(`/partner/slot?${query}`, token, 'slots'); complete &&= slots.complete;
        for (const slot of slots.rows) {
          try {
            if (slot?.place?.identifier && String(slot.place.identifier) !== String(unitId)) throw fail('UNIT_MISMATCH');
            const state = String(slot.status || '').toLowerCase();
            if (!slot._id || !state || ids.has(String(slot._id))) throw fail('INVALID_SLOT');
            const status = ({ active: 'confirmed', confirmed: 'confirmed', cancelled: 'cancelled', canceled: 'cancelled', denied: 'cancelled', checked_in: 'checked_in', checkin: 'checked_in' })[state];
            if (!status) {
              ids.add(String(slot._id));
              issues.push({ key: `totalpass:slot:${slot._id}:status`, code: 'TOTALPASS_SLOT_STATUS_UNSUPPORTED',
                detail: { externalId: String(slot._id), rawStatus: /^[a-z_ -]{1,40}$/.test(state) ? state : 'unrecognized' } });
              continue;
            }
            let candidates;
            const occurrenceId = slot.eventOccurrenceUuid ?? slot.occurrenceUuid ?? slot.eventOccurrence?.eventOccurrenceUuid;
            if (occurrenceId) candidates = snapshot.classes.filter(c => c.externalId === String(occurrenceId));
            else {
              const parsed = dateTime(slot.slotDate, slot.startTime), eventId = slot.eventId ?? slot.event?.id;
              candidates = snapshot.classes.filter(c => eventId != null && String(c.metadata.eventId) === String(eventId) && c.date === parsed.date && c.time === parsed.time);
            }
            // Deleted occurrences may remain in the slot history as cancellations.
            // Preserve the exact booking ID for the runtime's existing-booking
            // lookup, without inventing a class or blocking unrelated reservations.
            if (candidates.length === 0 && ['cancelled', 'canceled'].includes(state)) {
              ids.add(String(slot._id));
              bookings.push({ externalId: String(slot._id), classExternalId: null, status: 'cancelled',
                name: String(slot.user?.name || 'Cliente TotalPass') });
              continue;
            }
            if (candidates.length !== 1) throw fail('SLOT_CLASS_UNRESOLVED');
            ids.add(String(slot._id));
            bookings.push({ externalId: String(slot._id), classExternalId: candidates[0].externalId, status,
              name: String(slot.user?.name || 'Cliente TotalPass'),
              ...(slot.user?.email ? { email: String(slot.user.email) } : {}), ...(slot.user?.phone ? { phone: String(slot.user.phone) } : {}),
              ...(slot.user?.id ?? slot.userId ? { personId: String(slot.user?.id ?? slot.userId) } : {}) });
          } catch { complete = false; }
        }
      }
      return { classes: snapshot.classes.filter(c => c.date >= from && c.date <= to), bookings, issues, complete };
    },
    async publish(local, { capacity, cancellationHours = 6, externalReference = local.id }) {
      const patch = details(local, cancellationHours);
      if (!Number.isInteger(capacity) || capacity < 1 || !externalReference) throw fail('INVALID_CAPACITY_OR_REFERENCE');
      const { token, place } = await session(), snapshot = await classes(token);
      if (!snapshot.complete) throw fail('INCOMPLETE_CATALOG');
      const matches = snapshot.classes.filter(c => String(c.metadata.externalReference || '') === String(externalReference) || (c.title.trim().toLowerCase() === local.title.trim().toLowerCase() && c.date === local.date && c.time === local.time));
      if (matches.length > 1) throw fail('AMBIGUOUS_OCCURRENCE');
      if (matches.length === 1) return matches[0];
      const plans = place.Plans ?? place.plans;
      if (!Array.isArray(plans) || plans.length !== 1 || !(Number(plans[0].id) > 0)) throw fail('PLAN_SELECTION_REQUIRED');
      await call('/partner/event-occurrence', token, 'POST', { ...patch, slots: capacity, planId: Number(plans[0].id), timezone: 'es-MX', eventDate: local.date, startTime: ampm(local.time), status: 'ACTIVE', externalReference: String(externalReference) });
      const refreshed = await classes(token);
      const created = refreshed.classes.filter(c => String(c.metadata.externalReference || '') === String(externalReference) && c.date === local.date && c.time === local.time);
      if (!refreshed.complete || created.length !== 1) throw fail('CREATE_NOT_VERIFIED');
      return created[0];
    },
    async update(external, local, { capacity, cancellationHours = 6 }) {
      const patch = details(local, cancellationHours);
      if (!Number.isInteger(capacity) || capacity < 0) throw fail('INVALID_CAPACITY');
      const { token } = await session(), current = await exact(token, external);
      if (current.date !== local.date || current.time !== local.time) throw fail('RESCHEDULE_UNSUPPORTED');
      const target = Math.max(capacity, current.booked), path = `/partner/event-occurrence/${encodeURIComponent(current.externalId)}`;
      if (target !== current.capacity) await call(`${path}/slot`, token, 'PUT', { slots: target });
      try { await call(path, token, 'PUT', patch); }
      catch (error) {
        if (error.code === 'TOTALPASS_HTTP_400') throw fail('POLICY_UPDATE_FAILED');
        throw error;
      }
      const refreshed = await exact(token, current);
      if (refreshed.capacity !== target || refreshed.title !== patch.title || refreshed.coach !== patch.responsible) throw fail('UPDATE_NOT_VERIFIED');
      return refreshed;
    },
    async cancel(external) {
      const { token } = await session(), current = await exact(token, external);
      const cancelled = value => ['cancelled', 'canceled'].includes(String(value.metadata?.status || '').toLowerCase());
      if (cancelled(current)) return { externalId: current.externalId, status: 'cancelled' };
      await call(`/partner/event-occurrence/${encodeURIComponent(current.externalId)}`, token, 'DELETE');
      const refreshed = await classes(token);
      const remaining = refreshed.classes.find(c => c.externalId === current.externalId);
      if (!refreshed.complete || (remaining && !cancelled(remaining))) throw fail('CANCEL_NOT_VERIFIED');
      return { externalId: current.externalId, status: 'cancelled' };
    },
    async cancelBooking(booking) {
      const { token } = await session();
      const before = await this.catalog({ from: booking.date, to: booking.date });
      const current = before.bookings.find(b => b.externalId === String(booking.externalId));
      if (!before.complete || !current || current.classExternalId !== String(booking.classExternalId)) throw fail('BOOKING_OWNERSHIP_UNVERIFIED');
      if (current.status !== 'cancelled') await call(`/partner/slot/${encodeURIComponent(current.externalId)}`, token, 'DELETE');
      const after = await this.catalog({ from: booking.date, to: booking.date });
      const remaining = after.bookings.find(b => b.externalId === current.externalId);
      if (!after.complete || after.issues?.length || (remaining && (remaining.status !== 'cancelled' || remaining.classExternalId !== current.classExternalId))) throw fail('BOOKING_CANCEL_NOT_VERIFIED');
      return { ...booking, status: 'cancelled', snapshot: after };
    },
    async markAttendance() { throw fail('ATTENDANCE_UNSUPPORTED'); },
  };
}
