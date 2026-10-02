export function SectionTitle({ id, eyebrow, title, accent }: { id: string; eyebrow: string; title: string; accent: string }) {
  return (
    <div className="mb-6">
      <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-[1.75rem] font-bold leading-[1.15] tracking-tight text-ink sm:text-[2.5rem]">{title}</h2>
      <p className="mt-1 text-[1rem] leading-relaxed text-ink-muted sm:text-[1.2rem]">{accent}</p>
    </div>
  );
}
