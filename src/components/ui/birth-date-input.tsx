import { useEffect, useState } from "react";

/** Orden explícito día/mes/año; el API sigue recibiendo YYYY-MM-DD. */
export function BirthDateInput({ value = "", onChange }: { value?: string; onChange: (value: string) => void }) {
  const [parts, setParts] = useState(() => value.slice(0, 10).split("-"));
  useEffect(() => { setParts(value.slice(0, 10).split("-")); }, [value]);
  const [year = "", month = "", day = ""] = parts;
  const today = new Date();
  const currentYear = today.getFullYear();
  const days = month ? new Date(Number(year) || 2000, Number(month), 0).getDate() : 31;
  const partial = Boolean(year || month || day);
  const update = (index: number, next: string) => {
    const result = [year, month, day];
    result[index] = next;
    if (result[1] && Number(result[2]) > new Date(Number(result[0]) || 2000, Number(result[1]), 0).getDate()) result[2] = "";
    setParts(result);
    if (result.every(Boolean)) onChange(result.join("-"));
  };
  const selectClass = "h-11 w-full min-w-0 rounded-xl border-[1.5px] border-input bg-surface px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink";
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Fecha de nacimiento">
      <select aria-label="Día de nacimiento" className={selectClass} value={day} required={partial} onChange={e => update(2, e.target.value)}>
        <option value="">Día</option>
        {Array.from({ length: days }, (_, i) => i + 1).map(d => <option key={d} value={String(d).padStart(2, "0")}>{d}</option>)}
      </select>
      <select aria-label="Mes de nacimiento" className={selectClass} value={month} required={partial} onChange={e => update(1, e.target.value)}>
        <option value="">Mes</option>
        {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
      </select>
      <select aria-label="Año de nacimiento" className={selectClass} value={year} required={partial} onChange={e => update(0, e.target.value)}>
        <option value="">Año</option>
        {Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i).map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      {partial && <button type="button" className="col-span-3 justify-self-start text-xs text-ink-muted underline" onClick={() => { setParts([]); onChange(""); }}>Borrar fecha</button>}
    </div>
  );
}
