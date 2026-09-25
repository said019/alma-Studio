/* Enlace de WhatsApp para un teléfono de México. 10 dígitos → se antepone 52
   (igual que la ficha de clienta). Menos de 10 dígitos no es un teléfono. */
export function waLink(phone?: string | null): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${full}`;
}
