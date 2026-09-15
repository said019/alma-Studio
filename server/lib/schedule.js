// Agenda de jobs a hora de reloj del estudio.
//
// Antes todo corría con setInterval, que cuenta desde el arranque y no desde el
// reloj: el "recordatorio de las 9:00" en realidad era "cada hora a partir de
// cuando se desplegó". Dos consecuencias reales:
//   - El minuto en que corría dependía del último deploy.
//   - Con reinicios en la hora equivocada un bloque podía dispararse DOS veces
//     o ninguna, y runRenewalReminderCron no tiene guard de idempotencia: eso
//     son correos duplicados a las clientas, o un día sin avisos.
//
// Con setTimeout hacia la próxima ocurrencia civil, el job corre a su hora y un
// reinicio nunca lo repite: al arrancar, si la hora de hoy ya pasó, se agenda
// la de mañana. El proceso corre anclado a la zona del estudio (ver
// STUDIO_TIMEZONE en server/index.js), así que los getters locales de Date ya
// son hora del estudio.

const MAX_DELAY = 2 ** 31 - 1; // tope de setTimeout; por arriba dispara de inmediato

/**
 * Milisegundos hasta la próxima ocurrencia de una hora civil.
 * @param {{hour:number, minute?:number, weekday?:number|null}} cuando
 *        weekday: 0=domingo … 6=sábado; null/undefined = diario.
 * @param {Date} [ahora]
 */
export function msUntilNext({ hour, minute = 0, weekday = null }, ahora = new Date()) {
  const next = new Date(ahora);
  next.setHours(hour, minute, 0, 0);

  if (weekday === null || weekday === undefined) {
    if (next <= ahora) next.setDate(next.getDate() + 1);
  } else {
    const salto = (weekday - next.getDay() + 7) % 7;
    if (salto > 0) next.setDate(next.getDate() + salto);
    if (next <= ahora) next.setDate(next.getDate() + 7);
  }
  return next.getTime() - ahora.getTime();
}

/** Texto legible de la próxima corrida, en hora local del proceso. */
export function describeNext(cuando, ahora = new Date()) {
  const d = new Date(ahora.getTime() + msUntilNext(cuando, ahora));
  return d.toLocaleString("es-MX", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/**
 * Corre `fn` a la hora civil indicada, todos los días (o el día de la semana
 * dado), y se reagenda solo. Devuelve una función para cancelarlo.
 */
export function scheduleAt(label, cuando, fn, { logger = console } = {}) {
  let timer = null;
  let cancelado = false;

  const armar = () => {
    if (cancelado) return;
    const ms = Math.min(msUntilNext(cuando), MAX_DELAY);
    logger.log(`[Cron] ${label} → próxima corrida: ${describeNext(cuando)}`);
    timer = setTimeout(async () => {
      try {
        await fn();
      } catch (e) {
        logger.error(`[Cron] ${label} falló:`, e?.message ?? e);
      } finally {
        armar(); // se reagenda pase lo que pase
      }
    }, ms);
  };

  armar();
  return () => { cancelado = true; if (timer) clearTimeout(timer); };
}
