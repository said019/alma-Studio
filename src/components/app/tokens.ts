export const ALMA = {
  cream: "#FAF9F6",
  blush: "#E6DAC8",
  ink: "#43392F",
  berry: "#A48D78",
  coral: "#CBB9A4",
  olive: "#9C8E72",
  orange: "#C0A688",
  border: "#E0D5C6",
  destructive: "#B23A48",
} as const;

export type AlmaTone = keyof typeof ALMA;
