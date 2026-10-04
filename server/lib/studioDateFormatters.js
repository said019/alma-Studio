// Only fixed, explicit studio formats are cached. Dates and offsets are never cached.
const formatters = new Map();
const MAX_FORMATTERS = 16;

function createFormatter(kind, timeZone) {
  switch (kind) {
    case 'day':
      return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    case 'morning':
      return new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false });
    case 'afternoon':
      return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    case 'rules':
      return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    default:
      throw new RangeError(`Unknown studio date format: ${kind}`);
  }
}

export function studioDateTimeFormatter(kind, timeZone) {
  // Keep native coercion, observable toString calls and errors for non-string zones.
  if (typeof timeZone !== 'string') return createFormatter(kind, timeZone);
  const key = JSON.stringify([kind, timeZone]);
  const cached = formatters.get(key);
  if (cached) {
    formatters.delete(key);
    formatters.set(key, cached);
    return cached;
  }
  // Invalid zones throw before either insertion or eviction.
  const formatter = createFormatter(kind, timeZone);
  formatters.set(key, formatter);
  if (formatters.size > MAX_FORMATTERS) formatters.delete(formatters.keys().next().value);
  return formatter;
}
