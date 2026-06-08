// Paleta Frame Pilates Lab: greige cálido + café vino + tan. Compartida por
// toda la app de alumna y auth (debe coincidir con la landing en Index.tsx).
export const ALMA = {
  cream: "#E9E6DF",   // greige cálido, canvas
  blush: "#E4D2C3",   // tan suave
  ink: "#4A3333",     // café cálido, texto + oscuros
  inkDeep: "#241B1A", // café casi negro, drenched
  berry: "#8A6E60",   // café medio, acento
  wine: "#76214D",    // reservado
  coral: "#C7A892",   // tan apagado
  olive: "#8A7C66",   // neutro cálido
  orange: "#C7A892",  // tan apagado
  sand: "#DCD3C5",    // neutro greige
  border: "#D8CFC1",  // borde greige
  destructive: "#B23A48",
} as const;

export type AlmaTone = keyof typeof ALMA;
