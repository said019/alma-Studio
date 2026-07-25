// Precio de convenio por visita Wellhub. Se guarda en
// platform_credentials.extra_config.wellhub_class_price. Default 170.
export function resolveWellhubPrice(extraConfig) {
  const raw = extraConfig ? (extraConfig.wellhub_class_price ?? extraConfig.wellhubClassPrice) : undefined;
  if (raw == null || raw === "") return 170;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 170;
}
