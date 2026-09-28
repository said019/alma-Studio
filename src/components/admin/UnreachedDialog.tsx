import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type UnreachedPerson = { user_id: string; display_name: string | null; phone: string | null };

// "Avisa a mano": el canal de WhatsApp estaba caído (o apagado) al cancelar una
// clase, así que a estas alumnas no les llegó el aviso automático. Compartido
// por Reservas y el calendario de Clases (auditoría 2026-09-27).
export default function UnreachedDialog({
  items, channelOff, onClose,
}: {
  items: UnreachedPerson[];
  /** La dueña apagó los avisos de WhatsApp en Configuración (no es una caída del canal). */
  channelOff: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={items.length > 0} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-canvas border-line text-ink">
        <DialogHeader>
          <DialogTitle className="font-display text-ink">Avisa a mano a estas alumnas</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-ink/70">
            {channelOff ? "Los avisos de WhatsApp están apagados" : "WhatsApp está desconectado"} — no les llegó el aviso de la clase cancelada.
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {items.map((u) => (
              <li key={u.user_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium text-ink">{u.display_name || "Sin nombre"}</span>
                {u.phone ? (
                  <a href={`tel:${u.phone}`} className="text-sm font-bold text-ink underline underline-offset-2">{u.phone}</a>
                ) : (
                  <span className="text-sm text-ink/50">Sin teléfono</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
