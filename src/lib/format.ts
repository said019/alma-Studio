// Formato único de dinero y fechas para toda la plataforma (es-MX).
// Usar SIEMPRE estos helpers en vez de toFixed/toLocaleString sueltos.

export const formatMXN = (value: number): string =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);

export const formatDate = (value: string | Date): string =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(
    typeof value === "string" ? new Date(value) : value,
  );

export const formatDateTime = (value: string | Date): string =>
  new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);

export const formatTime = (value: string | Date): string =>
  new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
