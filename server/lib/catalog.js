// Catálogo inicial que se siembra en una instalación nueva (tablas vacías; ver
// server/lib/catalogSeed.js). Con filas existentes no se toca nada: el
// catálogo real del estudio se captura en el panel.

export const CATALOG_CLASS_TYPES = [
  { name: "Pilates Reformer", category: "reformer_tower", capacity: 4, duration_min: 50, color: "#76214D", sort_order: 1 },
  { name: "Pilates Tower",    category: "reformer_tower", capacity: 4, duration_min: 50, color: "#8A4A6B", sort_order: 2 },
  { name: "Pilates Mat",      category: "studio",         capacity: 8, duration_min: 50, color: "#A48D78", sort_order: 3 },
  { name: "Barre",            category: "studio",         capacity: 8, duration_min: 50, color: "#9C8E72", sort_order: 4 },
  { name: "Sculpt",           category: "studio",         capacity: 8, duration_min: 50, color: "#C0A688", sort_order: 5 },
];

export const CATALOG_SCHEDULE_SLOTS = [
  "6:00 am", "7:00 am", "8:00 am", "9:00 am", "10:00 am", "11:00 am",
  "5:00 pm", "6:00 pm", "7:00 pm", "8:00 pm",
];
export const CATALOG_SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6]; // lun..sáb

// Catálogo HIVE aprobado: MXN, 30 días; apertura se controla en ajustes.
export const CATALOG_PLANS = [
  ["1 Clase", 300, 280, 1],
  ["4 Clases", 1140, 1080, 4],
  ["10 Clases", 2600, 2450, 10],
  ["20 Clases", 4500, 4200, 20],
  ["Mes", 4200, 3750, null],
  ["Suscripción", 4000, 3900, null],
  ["Clases de 12 a 4", 250, 200, 1],
  ["Mes de 12 a 4", 3799, 3600, null],
  ["Personalizado", 500, 500, 1],
  ["Clase muestra", 200, 500, 1],
].map(([name, price, opening_price, class_limit], i) => ({
  name, price, opening_price, class_limit, duration_days: 30,
  class_category: "all", morning_only: false,
  afternoon_only: name.includes("12 a 4"),
  personal_only: name === "Personalizado",
  is_non_repeatable: name === "Clase muestra",
  repeat_key: name === "Clase muestra" ? "hive_trial" : null,
  sort_order: i + 1,
  description: name === "Suscripción"
    ? "Clases ilimitadas por 30 días. Renovación manual, sin cobros automáticos."
    : name === "Personalizado"
      ? "Una sesión individual, con cupo de una persona. Coordina tu horario con el estudio. Vigencia: 30 días."
      : `${class_limit == null ? "Clases ilimitadas" : `${class_limit} clase${class_limit === 1 ? "" : "s"}`}${name.includes("12 a 4") ? ", con inicio entre las 12:00 y las 16:00 (hora de Ciudad de México)" : ""}. Vigencia: 30 días.${name === "Clase muestra" ? " Una sola compra por persona." : ""}`,
}));
