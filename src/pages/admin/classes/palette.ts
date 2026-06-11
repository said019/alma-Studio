// Paleta canónica para tipos de clase del admin (tonos terrosos de marca).
// Cualquier color legacy guardado en BD (violetas, magentas, azules del negocio
// anterior) cae de forma estable a un tono de este set vía resolveClassColor.

export const CLASS_PALETTE = [
  { label: "Arena", value: "#CBB9A4" },
  { label: "Taupe", value: "#A48D78" },
  { label: "Espresso", value: "#6E5A46" },
  { label: "Oliva", value: "#5F6B4A" },
  { label: "Tinta", value: "#43392F" },
  { label: "Avena", value: "#E6DAC8" },
] as const;

export const DEFAULT_CLASS_COLOR = "#CBB9A4";

/* Colores que quedaron guardados en BD por versiones anteriores del admin. */
const LEGACY_COLOR_MAP: Record<string, string> = {
  "#8a6e60": "#6E5A46", // marrón legacy → Espresso
  "#c7a892": "#CBB9A4", // tan legacy → Arena
  "#8b5cf6": "#A48D78", // violeta → Taupe
  "#c026d3": "#6E5A46", // magenta → Espresso
  "#3b82f6": "#43392F", // azul → Tinta
  "#10b981": "#5F6B4A", // esmeralda → Oliva
  "#f97316": "#A48D78", // naranja → Taupe
};

export function resolveClassColor(raw?: string | null): string {
  if (!raw) return DEFAULT_CLASS_COLOR;
  const key = raw.trim().toLowerCase();
  const inSet = CLASS_PALETTE.find((c) => c.value.toLowerCase() === key);
  if (inSet) return inSet.value;
  if (LEGACY_COLOR_MAP[key]) return LEGACY_COLOR_MAP[key];
  // Color desconocido: cae de forma determinista a un tono del set para que
  // cada tipo conserve un color distinguible sin salirse de la paleta.
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return CLASS_PALETTE[Math.abs(hash) % CLASS_PALETTE.length].value;
}

/* Tinte de fondo al 10% para chips del calendario (nunca border-left). */
export function classTint(color: string): string {
  return `${color}1A`;
}

/* ── Taxonomía única de categorías ── */
export type ClassCategory = "studio" | "reformer_tower" | "mixto";

export const CATEGORY_OPTIONS: { value: ClassCategory; label: string }[] = [
  { value: "studio", label: "Studio" },
  { value: "reformer_tower", label: "Reformer/Tower" },
  { value: "mixto", label: "Mixto" },
];

export function normalizeCategory(raw?: string | null): ClassCategory | undefined {
  if (!raw) return undefined;
  if (raw === "studio" || raw === "reformer_tower" || raw === "mixto") return raw;
  // Categorías del negocio anterior: se reagrupan en la taxonomía vigente.
  if (raw === "barre" || raw === "jumping") return "studio";
  if (raw === "pilates") return "reformer_tower";
  return undefined;
}

export function categoryLabel(raw?: string | null): string {
  const normalized = normalizeCategory(raw);
  const option = CATEGORY_OPTIONS.find((o) => o.value === normalized);
  return option?.label ?? "Sin categoría";
}

/* Tabs hermanas de la sección Clases (mismas en las 3 páginas). */
export const CLASSES_SECTION_TABS = [
  { label: "Calendario", to: "/admin/classes" },
  { label: "Tipos de clase", to: "/admin/class-types" },
  { label: "Generar", to: "/admin/class-generator" },
];
