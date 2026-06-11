// Paleta canónica Alma Movement: brand kit greige cálido + espresso.
// Única fuente de verdad en JS — debe coincidir con las vars de index.css
// y con tailwind.config.ts (alma.*). Monocromo cálido estricto: el color
// decorativo vive en la familia greige; olive y destructive son SOLO
// semánticos (éxito / error), nunca decoración.
export const ALMA = {
  cream: "#FAF9F6",     // Feather White — canvas principal
  mist: "#F4F1EA",      // Porcelain Mist — superficies suaves
  blush: "#E6DAC8",     // Creamed Oat — bloques tintados, pills activos
  sandstone: "#CBB9A4", // Soft Sandstone — bordes fuertes, detalle
  stone: "#A48D78",     // Desert Rock — acento decorativo (solo texto grande ≥3:1)
  coral: "#A48D78",     // @deprecated → usar `stone`; se elimina al migrar
  berry: "#6E5A46",     // taupe profundo — acento AA para texto pequeño y fills
  ink: "#43392F",       // espresso — texto principal, CTAs sólidos
  inkDeep: "#241B1A",   // espresso profundo — secciones drenched
  border: "#E0D5C6",    // hairline
  olive: "#5F6B4A",     // SOLO éxito/confirmación
  destructive: "#B23A48",
} as const;

export type AlmaTone = keyof typeof ALMA;
