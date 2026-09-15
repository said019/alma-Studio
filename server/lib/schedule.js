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
const CATCH_UP_POR_DEFECTO = 12 * 60 * 60 * 1000; // hasta 12 h de retraso se recupera

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

/** Milisegundos desde la ÚLTIMA ocurrencia que ya pasó (la que debió correr). */
export function msSinceLast({ hour, minute = 0, weekday = null }, ahora = new Date()) {
  const prev = new Date(ahora);
  prev.setHours(hour, minute, 0, 0);
  if (weekday === null || weekday === undefined) {
    if (prev > ahora) prev.setDate(prev.getDate() - 1);
  } else {
    const atras = (prev.getDay() - weekday + 7) % 7;
    if (atras > 0) prev.setDate(prev.getDate() - atras);
    if (prev > ahora) prev.setDate(prev.getDate() - 7);
  }
  return { desde: prev, ms: ahora.getTime() - prev.getTime() };
}

function describeMoment(d) {
  return d.toLocaleString("es-MX", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** Texto legible de la próxima corrida, en hora local del proceso. */
export function describeNext(cuando, ahora = new Date()) {
  return describeMoment(new Date(ahora.getTime() + msUntilNext(cuando, ahora)));
}

/**
 * Corre `fn` a la hora civil indicada, todos los días (o el día de la semana
 * dado), y se reagenda solo. Devuelve una función para cancelarlo.
 */
export function scheduleAt(label, cuando, fn, {
  logger = console,
  store = null,                       // { get(label), set(label, isoLocal) }
  maxCatchUpMs = CATCH_UP_POR_DEFECTO,
} = {}) {
  let timer = null;
  let cancelado = false;

  const marcaLocal = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 23);

  const correr = async (motivo) => {
    try {
      await fn();
      if (store) await store.set(label, marcaLocal(new Date()));
    } catch (e) {
      logger.error(`[Cron] ${label} falló (${motivo}):`, e?.message ?? e);
    }
  };

  // Al arrancar: si la ocurrencia mas reciente ya paso y no quedo registrada,
  // se corre ahora. Sin esto, un deploy que abarque las 09:00 cuesta un dia
  // entero de recordatorios sin que nadie se entere. El registro tambien evita
  // que un reinicio repita un envio, que es lo que pasaba antes.
  const recuperar = async () => {
    if (!store || cancelado) return;
    try {
      const { desde, ms } = msSinceLast(cuando);
      if (ms > maxCatchUpMs) return;                       // demasiado viejo
      const ultima = await store.get(label);
      if (ultima && new Date(ultima) >= desde) return;     // ya corrio
      const minutos = Math.round(ms / 60000);
      logger.log(`[Cron] ${label}: se perdió la corrida de ${describeMoment(desde)} (hace ${minutos} min). Recuperando.`);
      await correr("recuperación");
    } catch (e) {
      logger.error(`[Cron] ${label}: no se pudo revisar la corrida perdida:`, e?.message ?? e);
    }
  };

  const armar = () => {
    if (cancelado) return;
    const ms = Math.min(msUntilNext(cuando), MAX_DELAY);
    logger.log(`[Cron] ${label} → próxima corrida: ${describeNext(cuando)}`);
    timer = setTimeout(async () => {
      await correr("programada");
      armar(); // se reagenda pase lo que pase
    }, ms);
  };

  armar();
  recuperar();
  return () => { cancelado = true; if (timer) clearTimeout(timer); };
}
