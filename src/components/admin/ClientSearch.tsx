import { useEffect, useId, useState, type KeyboardEvent, type Ref } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { Avatar } from "./PersonCell";

export type ClientHit = { id: string; displayName: string; email?: string | null; phone?: string | null };

type ClientSearchProps = {
  onSelect: (client: ClientHit) => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  className?: string;
  /** Muestra el atajo ⌘K dentro del campo (barra superior). */
  shortcutHint?: boolean;
  placeholder?: string;
  label?: string;
};

export const MIN_CHARS = 2;

/**
 * Buscador de clientas (combobox, spec §4.2). Busca desde 2 letras, espera
 * 300 ms entre teclas y codifica el término. La llave de la consulta incluye
 * el término, así que los resultados siempre son los de lo último escrito.
 */
export default function ClientSearch({
  onSelect, inputRef, autoFocus, className, shortcutHint = false,
  placeholder = "Buscar clienta", label = "Buscar clienta",
}: ClientSearchProps) {
  const id = useId();
  const listId = `${id}-lista`;
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(term.trim(), 300);
  const enabled = debounced.length >= MIN_CHARS;

  const { data, isFetching, isError, refetch } = useQuery<{ data: ClientHit[] }>({
    queryKey: ["client-search", debounced],
    queryFn: async () => (await api.get(`/users?role=client&search=${encodeURIComponent(debounced)}`)).data,
    enabled,
    staleTime: 30_000,
  });
  const hits = enabled && Array.isArray(data?.data) ? data!.data.slice(0, 8) : [];

  useEffect(() => setActive(0), [debounced]);

  const pick = (c: ClientHit) => {
    onSelect(c);
    setTerm("");
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && hits[active]) {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && enabled;
  const optionId = (i: number) => `${id}-opcion-${i}`;

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        id={id}
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? optionId(active) : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={term}
        placeholder={placeholder}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-14 text-sm text-ink placeholder:text-ink-muted focus:border-2 focus:border-ink focus:outline-none focus:ring-4 focus:ring-accent-soft"
      />
      {shortcutHint && (
        <kbd aria-hidden="true" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-line bg-canvas px-1.5 text-[0.75rem] font-bold text-ink-muted">
          ⌘K
        </kbd>
      )}
      {showList && (
        <div id={listId} role="listbox" aria-label="Clientas encontradas" className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          {isFetching && hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">Buscando…</p>
          ) : isError ? (
            <p className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-danger">
              No pudimos buscar.
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => refetch()} className="min-h-[44px] font-bold underline">
                Reintentar
              </button>
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">No encontramos a nadie con esos datos.</p>
          ) : (
            hits.map((c, i) => (
              <div
                key={c.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2", i === active && "bg-sunken")}
              >
                <Avatar name={c.displayName} size={32} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-bold text-ink">{c.displayName}</span>
                  <span className="block truncate text-xs text-ink-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
