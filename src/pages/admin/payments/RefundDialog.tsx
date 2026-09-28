import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { REASON_MIN_CHARS } from "@/lib/audit-log";
import { formatMXN } from "@/lib/format";
import { REFUND_METHOD_LABEL, refundRemaining, suggestedClassesToRemove, type RefundablePayment } from "./refund-math";

type Metodo = keyof typeof REFUND_METHOD_LABEL;
const SELECT_CLS = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:border-2 focus:border-ink focus:outline-none";

/* Registrar un reembolso (auditoría 2026-09-27, P1-12): sólo la dueña. El
   dinero se devuelve fuera del sistema; aquí queda el registro, las clases se
   ajustan y el motivo va a la bitácora. */
export default function RefundDialog({ payment, onClose }: { payment: RefundablePayment | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"total" | "partial">("total");
  const [amountStr, setAmountStr] = useState("");
  const [classesStr, setClassesStr] = useState("");
  const [classesTouched, setClassesTouched] = useState(false);
  const [method, setMethod] = useState<Metodo>("cash");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    setKind("total"); setAmountStr(""); setClassesStr(""); setClassesTouched(false);
    setMethod("cash"); setReference(""); setReason("");
  }, [payment?.orderId]);

  const mutation = useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: Record<string, unknown>; resumen: string }) =>
      api.post(`/admin/orders/${orderId}/refunds`, body),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: "Reembolso registrado", description: vars.resumen });
      onClose();
    },
    onError: (e: any) => toast({
      title: "No se pudo registrar el reembolso",
      description: e?.response?.data?.message ?? "Inténtalo de nuevo.",
      variant: "destructive",
    }),
  });

  if (!payment) return null;

  const total = Number(payment.total_amount ?? 0);
  const remaining = refundRemaining(total, payment.refundedAmount);
  const unlimited = payment.classesRemaining === null || payment.classesRemaining === undefined || Number(payment.classesRemaining) >= 9999;
  const puedeQuitar = Boolean(payment.membershipId) && payment.membershipStatus === "active" && !unlimited;
  const amount = kind === "total" ? remaining : Number(amountStr.trim().replace(",", "."));
  const sugerencia = kind === "partial" && puedeQuitar
    ? suggestedClassesToRemove({ amount, charged: total, classLimit: payment.classLimit, classesRemaining: payment.classesRemaining })
    : 0;
  const clases = kind === "total"
    ? (unlimited || !payment.membershipId ? 0 : Number(payment.classesRemaining ?? 0))
    : classesTouched ? Number(classesStr) : sugerencia;
  const amountOk = kind === "total" || (Number.isFinite(amount) && amount > 0 && amount < remaining - 0.004);
  const clasesOk = kind === "total" || (Number.isInteger(clases) && clases >= 0 && (puedeQuitar ? clases <= Number(payment.classesRemaining ?? 0) : clases === 0));
  const reasonOk = reason.trim().length >= REASON_MIN_CHARS;
  const cancelaMembresia = Boolean(payment.membershipId) && payment.membershipStatus !== "cancelled";
  const resumen = kind === "total"
    ? `Se devuelven ${formatMXN(remaining)}${cancelaMembresia ? `, se cancela la membresía${clases > 0 ? ` y se quitan sus ${clases} clases sin usar` : ""}; sus reservas futuras se cancelan` : ""}.`
    : `Se devuelven ${amountOk ? formatMXN(amount) : "—"}${clases > 0 ? ` y se quitan ${clases} ${clases === 1 ? "clase" : "clases"}` : ""}. La membresía sigue activa.`;

  const enviar = () => mutation.mutate({
    orderId: payment.orderId,
    resumen,
    body: {
      kind, method, reason: reason.trim(),
      ...(kind === "partial" ? { amount, classesToRemove: clases } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    },
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md border-line bg-canvas text-ink">
        <DialogHeader>
          <DialogTitle className="font-display text-ink">Reembolsar a {payment.userName ?? "la clienta"}</DialogTitle>
          <DialogDescription className="text-sm text-ink-muted">
            {payment.planName ?? "Pago"} · cobrado {formatMXN(total)}
            {Number(payment.refundedAmount ?? 0) > 0 ? ` · ya se devolvieron ${formatMXN(Number(payment.refundedAmount))}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-bold">Tipo de reembolso</legend>
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="radio" name="refund-kind" checked={kind === "total"} onChange={() => setKind("total")} />
              Reembolso total ({formatMXN(remaining)})
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="radio" name="refund-kind" checked={kind === "partial"} onChange={() => setKind("partial")} />
              Reembolso parcial
            </label>
          </fieldset>

          {kind === "partial" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ref-monto">Monto a devolver</Label>
                <Input id="ref-monto" type="number" inputMode="decimal" min={0} step="1" className="nums"
                  value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
                <p className="text-[0.75rem] text-ink-muted">Quedan {formatMXN(remaining)} por devolver.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-clases">Clases a quitar</Label>
                <Input id="ref-clases" type="number" inputMode="numeric" min={0} step="1" className="nums" disabled={!puedeQuitar}
                  value={classesTouched ? classesStr : String(sugerencia)}
                  onChange={(e) => { setClassesTouched(true); setClassesStr(e.target.value); }} />
                <p className="text-[0.75rem] text-ink-muted">
                  {unlimited
                    ? "La membresía es ilimitada: no se quitan clases."
                    : !puedeQuitar
                      ? "Sin membresía activa: no se quitan clases."
                      : `Le quedan ${payment.classesRemaining} sin usar. Sugerido: ${sugerencia}.`}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ref-metodo">¿Cómo se devolvió?</Label>
            <select id="ref-metodo" className={SELECT_CLS} value={method} onChange={(e) => setMethod(e.target.value as Metodo)}>
              {(Object.keys(REFUND_METHOD_LABEL) as Metodo[]).map((m) => <option key={m} value={m}>{REFUND_METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-referencia">Referencia (opcional)</Label>
            <Input id="ref-referencia" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Folio de la transferencia o del voucher" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-motivo">Motivo (obligatorio)</Label>
            <Textarea id="ref-motivo" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. no pudo seguir por una lesión" />
            <p className="text-[0.75rem] text-ink-muted">Queda en la bitácora con tu nombre. Mínimo {REASON_MIN_CHARS} caracteres.</p>
          </div>
          <p className="rounded-xl bg-accent-soft p-3 text-[13px] text-ink" aria-live="polite">{resumen}</p>
          <p className="text-[0.75rem] text-ink-muted">El dinero se devuelve fuera del sistema: aquí sólo queda registrado.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!amountOk || !clasesOk || !reasonOk || mutation.isPending} onClick={enviar}>
            {mutation.isPending ? "Registrando…" : "Registrar reembolso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
