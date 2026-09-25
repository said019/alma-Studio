// La paleta vive en src/design/classPalette.ts (spec §3.2 regla 6).
export { CLASS_PALETTE, DEFAULT_CLASS_COLOR, resolveClassColor } from "@/design/classPalette";

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
