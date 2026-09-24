// PUENTE TEMPORAL — Alma → HIVE (spec §6.2). La Tarea 5 borra este archivo.
// Los nombres viejos apuntan a los valores nuevos por función, para que toda
// la app cambie de color sin tocar ninguna pantalla todavía.
import { COLOR } from "@/design/tokens";

export const ALMA = {
  cream: COLOR.canvas,
  mist: COLOR.sunken,
  blush: COLOR.sunken,
  sandstone: COLOR.line,
  stone: COLOR.inkMuted,
  coral: COLOR.inkMuted, // alias viejo de "stone": era beige, NO el coral de HIVE
  berry: COLOR.accentStrong,
  ink: COLOR.ink,
  inkDeep: COLOR.inverse,
  border: COLOR.line,
  olive: COLOR.success,
  destructive: COLOR.danger,
} as const;

export type AlmaTone = keyof typeof ALMA;
