// Fuente única de la verdad del catálogo de Alma Movement (Fase 1).

export const ALMA_CLASS_TYPES = [
  { name: "Pilates Reformer", category: "reformer_tower", capacity: 4, duration_min: 50, color: "#76214D", sort_order: 1 },
  { name: "Pilates Tower",    category: "reformer_tower", capacity: 4, duration_min: 50, color: "#8A4A6B", sort_order: 2 },
  { name: "Pilates Mat",      category: "studio",         capacity: 8, duration_min: 50, color: "#A48D78", sort_order: 3 },
  { name: "Barre",            category: "studio",         capacity: 8, duration_min: 50, color: "#9C8E72", sort_order: 4 },
  { name: "Sculpt",           category: "studio",         capacity: 8, duration_min: 50, color: "#C0A688", sort_order: 5 },
];

export const ALMA_SCHEDULE_SLOTS = [
  "6:00 am", "7:00 am", "8:00 am", "9:00 am", "10:00 am", "11:00 am",
  "5:00 pm", "6:00 pm", "7:00 pm", "8:00 pm",
];
export const ALMA_SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6]; // lun..sáb

// price = regular; opening_price = apertura (solo ilimitados). class_limit null = ilimitado.
export const ALMA_PLANS = [
  { name: "Alma Studio Intro", description: "1 clase muestra Studio, solo para nuevas alumnas.", price: 150, opening_price: null, class_limit: 1, duration_days: 7, class_category: "studio", morning_only: false, is_non_repeatable: true, repeat_key: "alma_studio_intro", sort_order: 1 },
  { name: "Clase Única Studio", description: "1 sesión Studio (Mat, Barre o Sculpt).", price: 240, opening_price: null, class_limit: 1, duration_days: 30, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 2 },
  { name: "4 Sesiones Studio", description: "4 sesiones Studio.", price: 900, opening_price: null, class_limit: 4, duration_days: 30, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 3 },
  { name: "8 Sesiones Studio", description: "8 sesiones Studio.", price: 1700, opening_price: null, class_limit: 8, duration_days: 30, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 4 },
  { name: "12 Sesiones Studio", description: "12 sesiones Studio.", price: 2150, opening_price: null, class_limit: 12, duration_days: 45, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 5 },
  { name: "Studio Ilimitado", description: "Sesiones ilimitadas Studio (Mat + Barre + Sculpt).", price: 2700, opening_price: 2300, class_limit: null, duration_days: 30, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 6 },
  { name: "Clase Única Reformer/Tower", description: "1 sesión en Reformer o Tower.", price: 270, opening_price: null, class_limit: 1, duration_days: 30, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 7 },
  { name: "4 Sesiones Reformer/Tower", description: "4 sesiones Reformer/Tower.", price: 920, opening_price: null, class_limit: 4, duration_days: 30, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 8 },
  { name: "8 Sesiones Reformer/Tower", description: "8 sesiones Reformer/Tower.", price: 1760, opening_price: null, class_limit: 8, duration_days: 30, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 9 },
  { name: "12 Sesiones Reformer/Tower", description: "12 sesiones Reformer/Tower.", price: 2280, opening_price: null, class_limit: 12, duration_days: 45, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 10 },
  { name: "Reformer/Tower Ilimitado", description: "Sesiones ilimitadas en Reformer y Tower.", price: 2900, opening_price: 2500, class_limit: null, duration_days: 30, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 11 },
  { name: "Alma Balance", description: "8 sesiones: 4 Studio + 4 Reformer/Tower.", price: 1500, opening_price: null, class_limit: 8, duration_days: 30, class_category: "mixto", studio_credits: 4, rt_credits: 4, morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 12 },
  { name: "Alma Fusion", description: "12 sesiones: 6 Studio + 6 Reformer/Tower.", price: 2200, opening_price: null, class_limit: 12, duration_days: 30, class_category: "mixto", studio_credits: 6, rt_credits: 6, morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 13 },
  { name: "Alma Experience", description: "16 sesiones: 8 Studio + 8 Reformer/Tower.", price: 2800, opening_price: null, class_limit: 16, duration_days: 45, class_category: "mixto", studio_credits: 8, rt_credits: 8, morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 14 },
  { name: "AM Club", description: "8 sesiones Studio, solo horario matutino (7–10am).", price: 1300, opening_price: null, class_limit: 8, duration_days: 30, class_category: "studio", morning_only: true, is_non_repeatable: false, repeat_key: null, sort_order: 15 },
  { name: "AM Club Reformer & Tower", description: "8 sesiones Reformer/Tower, solo matutino (7–10am).", price: 1600, opening_price: null, class_limit: 8, duration_days: 30, class_category: "reformer_tower", morning_only: true, is_non_repeatable: false, repeat_key: null, sort_order: 16 },
  { name: "Alma Unlimited", description: "Acceso ilimitado a las 5 disciplinas: Reformer, Tower, Mat, Barre y Sculpt.", price: 3900, opening_price: 3500, class_limit: null, duration_days: 30, class_category: "all", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 17 },
];

export const ALMA_PLAN_NAMES = ALMA_PLANS.map((p) => p.name);
