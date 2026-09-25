type SaveBarProps = { dirty: boolean; saving?: boolean; onSave: () => void; onDiscard: () => void };

/* Aviso fijo abajo cuando un formulario tiene cambios (spec §5.18). */
export default function SaveBar({ dirty, saving = false, onSave, onDiscard }: SaveBarProps) {
  if (!dirty) return null;
  return (
    <div role="status" className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-inverse px-5 py-3.5 text-inverse-foreground">
      <span className="flex-1 text-sm font-bold">Tienes cambios sin guardar</span>
      <button
        type="button"
        onClick={onDiscard}
        disabled={saving}
        className="min-h-[44px] rounded-full border border-inverse-muted px-5 text-sm font-bold text-inverse-foreground"
      >
        Descartar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="min-h-[44px] rounded-full bg-canvas px-5 text-sm font-bold text-ink disabled:bg-sunken disabled:text-line-strong"
      >
        {saving ? "Guardando…" : "Guardar cambios"}
      </button>
    </div>
  );
}
