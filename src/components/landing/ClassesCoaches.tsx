import { SectionTitle } from "./SectionTitle";
import { classTypeDuration, specialtiesText, type ClassTypeRow, type CoachRow } from "./landingData";

const DIFF = ["Grupos pequeños: atención de verdad.", "Comunidad que te empuja a volver.", "Pilates · Café · Wellness."];

type Props = { classTypes: ClassTypeRow[]; coaches: CoachRow[]; loading: boolean; error: boolean; onRetry: () => void };

export function ClassesCoaches({ classTypes, coaches, loading, error, onRetry }: Props) {
  return (
    <section id="clases" aria-labelledby="clases-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 lg:py-20">
        <SectionTitle id="clases-titulo" eyebrow={coaches.length ? "Clases y coaches" : "Clases"} title="Reformer," accent="a tu ritmo y al nuestro." />

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
            {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-[18px] border border-line bg-surface/70" />)}
          </div>
        ) : (
          <>
            {/* Si falla una de las dos consultas, el aviso va arriba y la otra mitad se conserva. */}
            {error && (
              <div className={"flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-surface/70 p-4" + (classTypes.length > 0 || coaches.length > 0 ? " mb-6" : "")}>
                <p className="text-[0.9rem] text-ink-muted">No pudimos cargar las clases.</p>
                <button type="button" onClick={onRetry} className="min-h-[44px] rounded-full border border-line-strong px-4 text-[0.85rem] font-bold text-ink">
                  Reintentar
                </button>
              </div>
            )}
            {classTypes.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {classTypes.map((t) => {
                  const dur = classTypeDuration(t);
                  return (
                    <li key={t.id} className="rounded-[18px] border border-line bg-surface/70 p-4">
                      <h3 className="font-display text-[1rem] font-bold text-ink">{t.name}</h3>
                      {(t.description || t.subtitle) && (
                        <p className="mt-1 text-[0.85rem] leading-[1.5] text-ink-muted">{t.description || t.subtitle}</p>
                      )}
                      {dur && <span className="mt-3 inline-block rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-accent">{dur} min</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {coaches.length > 0 && (
              <ul aria-label="Coaches" className="mt-8 flex gap-4 overflow-x-auto pb-2">
                {coaches.map((c) => (
                  <li key={c.id} className="w-24 shrink-0 text-center">
                    {c.photoUrl ? (
                      <img
                        src={c.photoUrl}
                        alt=""
                        loading="lazy"
                        className="clip-hex mx-auto h-[74px] w-16 object-cover"
                        style={{ objectPosition: `${c.photoFocusX ?? 50}% ${c.photoFocusY ?? 50}%` }}
                      />
                    ) : (
                      <span data-monograma aria-hidden="true" className="clip-hex mx-auto grid h-[74px] w-16 place-items-center bg-accent-soft font-display text-[1.25rem] font-extrabold text-accent">
                        {c.displayName.trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <p className="mt-2 truncate text-[0.8rem] font-bold text-ink">{c.displayName}</p>
                    {specialtiesText(c.specialties) && <p className="truncate text-[0.75rem] text-ink-muted">{specialtiesText(c.specialties)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <ul className="mt-8 grid gap-2">
          {DIFF.map((d) => (
            <li key={d} className="flex items-center gap-2 text-[0.9rem] text-ink">
              <span aria-hidden="true" className="text-accent">⬡</span>
              {d}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
