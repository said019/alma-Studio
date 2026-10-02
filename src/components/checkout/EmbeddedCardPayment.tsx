import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { loadMercadoPagoSdk, type CardSession, type CardPayment } from "@/lib/mercadopago";
import { Button } from "@/components/ui/button";

type Controller = { unmount: () => void | Promise<void> };
type CardForm = { token?: string; payment_method_id?: string; issuer_id?: string; payer?: { identification?: { type?: string; number?: string } } };
type SDK = new (key: string, options: { locale: string }) => { bricks: () => { create: (kind: string, host: string, settings: unknown) => Promise<Controller> } };

/** Card details stay in provider fields. Only the server confirms payment/activation. */
export function EmbeddedCardPayment({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const host = `hive-mp-card-${useId().replace(/:/g, "")}`;
  const qc = useQueryClient();
  const [session, setSession] = useState<CardSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [formError, setError] = useState("");
  const error = sessionError || formError;
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const submitted = useRef(false);
  const submitting = useRef(false);
  const hasAttempt = useRef(false);
  const queue = useRef(Promise.resolve());
  const refresh = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let alive = true, busy = false;
    submitted.current = false;
    hasAttempt.current = false;
    setSession(null);
    setSessionError("");
    setError("");
    refresh.current = async () => {
      if (busy || !alive) return;
      busy = true;
      try {
        const checkingAttempt = hasAttempt.current;
        const response = checkingAttempt
          ? await api.post(`/orders/${orderId}/card-payment-sync`)
          : await api.get(`/orders/${orderId}/card-payment-session`);
        const next = (response.data.data ?? response.data) as CardSession;
        if (alive) {
          hasAttempt.current = hasAttempt.current || Boolean(next.payment);
          if (checkingAttempt && !submitting.current && submitted.current && next.canSubmit && !next.payment) { submitted.current = false; setRetry(v => v + 1); }
          setSession(next);
          setSessionError("");
          if (next.orderStatus === "approved") setError("");
        }
      } catch (e: any) {
        if (alive) setSessionError(e?.response?.data?.message || "No pudimos consultar tu pago. Revisa el estado de esta orden antes de volver a pagar.");
      } finally { busy = false; }
    };
    void refresh.current();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh.current(); }, 5000);
    const resume = () => { if (!document.hidden) void refresh.current(); };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [orderId]);

  useEffect(() => {
    if (session?.orderStatus !== "approved" && !["refunded", "charged_back", "cancelled"].includes(session?.payment?.status ?? "")) return;
    for (const key of [["my-orders"], ["order-detail", orderId], ["my-membership"], ["my-memberships"]]) void qc.invalidateQueries({queryKey: key});
  }, [session?.orderStatus, session?.payment?.status, session?.refundStatus, orderId, qc]);

  const challenge = session?.payment?.statusDetail === "pending_challenge" && session.payment.threeDS;
  const closed = session && ["approved", "cancelled", "expired", "rejected"].includes(session.orderStatus);
  const kind = !closed && challenge ? "statusScreen" : !closed && session?.canSubmit && !submitted.current && !session.payment ? "cardPayment" : null;
  const publicKey = session?.publicKey, amount = session?.amount, email = session?.email;
  const paymentId = session?.payment?.paymentId;
  const challengeURL = challenge ? challenge.external_resource_url : undefined;
  const creq = challenge ? challenge.creq : undefined;

  useEffect(() => {
    if (!kind || !publicKey || (kind === "statusScreen" && !paymentId)) return;
    let cancelled = false;
    let controller: Controller | undefined;
    setReady(false);
    setError("");
    const timeout = window.setTimeout(() => { if (!cancelled) setError("El formulario no terminó de cargar. Puedes volver a cargarlo aquí."); }, 15000);
    queue.current = queue.current.catch(() => {}).then(async () => {
      try {
        const Sdk = await loadMercadoPagoSdk() as SDK;
        if (cancelled) return;
        controller = await new Sdk(publicKey, {locale: "es-MX"}).bricks().create(kind, host, {
          initialization: kind === "cardPayment" ? {amount, payer: {email}} : {paymentId, additionalInfo: {externalResourceURL: challengeURL, creq}},
          customization: kind === "cardPayment" ? {paymentMethods: {maxInstallments: 1, minInstallments: 1}} : undefined,
          callbacks: {
            onReady: () => { window.clearTimeout(timeout); if (!cancelled) { setReady(true); setError(""); } },
            onError: () => { window.clearTimeout(timeout); if (!cancelled) setError("No pudimos cargar el formulario seguro. Consulta el estado antes de reintentar."); },
            onSubmit: async (form: CardForm) => {
              if (submitted.current || cancelled) return;
              submitted.current = true;
              submitting.current = true;
              hasAttempt.current = true;
              try {
                const payload = {token: form.token, payment_method_id: form.payment_method_id, issuer_id: form.issuer_id, installments: 1, payer: {identification: form.payer?.identification}};
                const response = await api.post(`/orders/${orderId}/card-payment`, payload);
                const payment = (response.data.data ?? response.data) as CardPayment;
                if (!cancelled) setSession(s => s && ({...s, canSubmit: false, payment}));
              } catch (e: any) {
                if (!cancelled) { setSession(s => s && ({...s, canSubmit: false})); setError(e?.response?.data?.message || "Estamos verificando tu intento. No vuelvas a pagar esta orden."); }
              }
              submitting.current = false;
              void refresh.current();
            },
          },
        });
        if (cancelled) await controller.unmount();
      } catch { window.clearTimeout(timeout); if (!cancelled) setError("No pudimos cargar Mercado Pago. Puedes volver a cargar el formulario sin salir de esta página."); }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (controller) queue.current = queue.current.then(() => controller?.unmount()).then(() => {});
    };
  }, [kind, publicKey, amount, email, paymentId, challengeURL, creq, host, orderId, retry]);

  const statusText = session?.payment?.status === "charged_back" ? "El pago tiene un contracargo. Consulta al estudio el estado de tu membresía."
    : session?.payment?.status === "refunded" || session?.refundStatus === "refunded" ? "El pago fue reembolsado. Esta compra ya no activa tu membresía."
    : session?.refundStatus === "partially_refunded" ? "Esta compra tiene un reembolso parcial. Consulta el detalle de tu orden."
    : session?.payment?.status === "cancelled" ? "El pago fue cancelado. Consulta al estudio antes de volver a pagar."
    : session?.orderStatus === "approved" ? "Pago confirmado. Tu compra está lista."
    : session?.orderStatus === "cancelled" ? "Esta orden está cancelada. No se puede pagar."
    : session?.orderStatus === "expired" ? "Esta orden venció. Consulta tus órdenes antes de iniciar otra compra."
    : session?.orderStatus === "rejected" || session?.payment?.status === "rejected" ? "El pago fue rechazado. Revisa esta orden antes de iniciar otra compra."
    : !session ? "Consultando tu orden…"
    : kind === "statusScreen" ? "Completa la verificación de tu banco en esta página."
    : !kind ? "Estamos verificando el pago. No vuelvas a pagar esta orden."
    : "Introduce tu tarjeta en el formulario seguro de Mercado Pago.";
  return <section aria-label="Pago con tarjeta" className="mx-auto w-full min-w-0 max-w-xl space-y-5 py-6 pb-24">
    <Button variant="outline" onClick={onClose}>Volver a mi orden</Button>
    <h2 className="font-display text-2xl text-ink">Pago con tarjeta</h2>
    {session && <p className="nums text-xl text-ink">{session.amount.toLocaleString("es-MX", {style: "currency", currency: session.currency || "MXN"})}</p>}
    <p role="status" className="text-sm text-ink-muted">{statusText}</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {kind && !ready && !error && <p role="status" className="text-sm text-ink-muted">Cargando formulario de tarjeta…</p>}
    <div id={host} className={kind ? "min-h-[280px]" : ""} />
    {error && <Button variant="outline" onClick={() => { void refresh.current(); if (!submitted.current) setRetry(v => v + 1); }}>Consultar / volver a cargar</Button>}
    <Link onClick={onClose} to={`/app/orders/${encodeURIComponent(orderId)}`} className="inline-flex min-h-11 items-center text-sm font-bold text-accent-strong">Ver mi orden</Link>
    <p className="text-xs text-ink-muted">Puedes retomar esta misma orden desde Mis órdenes. Este pago no autoriza cargos mensuales automáticos.</p>
  </section>;
}
