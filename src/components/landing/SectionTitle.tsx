export function SectionTitle({ id, eyebrow, title, accent }: { id: string; eyebrow: string; title: string; accent: string }) {
  return (
    <div className="mb-6">
      <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-[1.5rem] font-extrabold uppercase leading-[1.05] text-ink sm:text-[2rem]">{title}</h2>
      <p className="mt-1 font-display text-[1rem] font-bold text-accent sm:text-[1.2rem]">{accent}</p>
    </div>
  );
}
