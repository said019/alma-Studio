// Colores de tipo de clase del calendario del panel. Se guardan en la base
// (class_types.color). Neutros a propósito: coral es "atención" en el panel y
// verde es sólo "confirmación" (spec §3.2). El nombre del tipo ya lo distingue.
import { COLOR } from "./tokens";

export const CLASS_PALETTE = [
  { label: "Tinta", value: COLOR.ink },
  { label: "Grafito", value: COLOR.inkMuted },
  { label: "Concreto", value: COLOR.lineStrong },
] as const;

export const DEFAULT_CLASS_COLOR = COLOR.inkMuted;

/* Colores guardados por versiones anteriores (Alma y el negocio previo). */
const LEGACY_COLOR_MAP: Record<string, string> = {
  "#cbb9a4": COLOR.lineStrong, // Arena
  "#a48d78": COLOR.lineStrong, // Taupe
  "#6e5a46": COLOR.inkMuted,   // Espresso
  "#5f6b4a": COLOR.inkMuted,   // Oliva
  "#43392f": COLOR.ink,        // Tinta
  "#e6dac8": COLOR.lineStrong, // Avena
  "#8a6e60": COLOR.inkMuted,
  "#c7a892": COLOR.lineStrong,
  "#8b5cf6": COLOR.inkMuted,
  "#c026d3": COLOR.inkMuted,
  "#3b82f6": COLOR.ink,
  "#10b981": COLOR.inkMuted,
  "#f97316": COLOR.lineStrong,
};

export function resolveClassColor(raw?: string | null): string {
  if (!raw) return DEFAULT_CLASS_COLOR;
  const key = raw.trim().toLowerCase();
  const inSet = CLASS_PALETTE.find((c) => c.value.toLowerCase() === key);
  if (inSet) return inSet.value;
  if (LEGACY_COLOR_MAP[key]) return LEGACY_COLOR_MAP[key];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return CLASS_PALETTE[Math.abs(hash) % CLASS_PALETTE.length].value;
}
