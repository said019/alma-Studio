import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Check, Copy } from "lucide-react";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import { ErrorState, SkeletonRow } from "@/components/app/AppShell";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useToast } from "@/hooks/use-toast";
import { DARK } from "@/design/tokens";

type ScreenLock = { release: () => Promise<void>; addEventListener: (type: string, listener: () => void) => void };

function QrPass() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
    staleTime: 30_000,
  });
  const pass = data?.data ?? data ?? {};
  const qr = pass.qr_code ?? pass.qrCode ?? "";
  const membership = pass.membership;
  const limit = membership?.class_limit ?? membership?.classLimit;
  const unlimited = membership && (limit == null || Number(limit) >= 9999);
  const remaining = membership?.classes_remaining ?? membership?.classesRemaining;
  const end = membership?.end_date ?? membership?.endDate;
  const endDate = end ? new Date(`${String(end).slice(0, 10)}T12:00:00`) : null;
  const endDisplay = endDate && !Number.isNaN(endDate.getTime())
    ? endDate.toLocaleDateString("es-MX", { day: "numeric", month: "long" }) : null;

  useEffect(() => {
    let disposed = false;
    let requesting = false;
    let lock: ScreenLock | null = null;
    const request = async () => {
      const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: string) => Promise<ScreenLock> } }).wakeLock;
      if (!wakeLock || lock || requesting || document.visibilityState === "hidden") return;
      requesting = true;
      try {
        const acquired = await wakeLock.request("screen");
        if (disposed) { await acquired.release(); return; }
        lock = acquired;
        acquired.addEventListener("release", () => { if (lock === acquired) lock = null; });
      } catch { /* El QR funciona aunque el dispositivo no permita mantener la pantalla encendida. */ }
      finally { requesting = false; }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void request(); };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      clearTimeout(copyTimer.current);
    };
  }, []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(qr);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "No se pudo copiar el código", description: "Muestra tu QR en recepción.", variant: "destructive" });
    }
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-canvas px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-ink">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between py-2">
        <Link to="/app" aria-label="Volver al inicio" className="grid h-11 w-11 place-items-center rounded-full border border-line-strong text-ink"><ArrowLeft size={18} /></Link>
        <h1 className="text-base">Mi QR</h1>
        <span className="w-11" aria-hidden="true" />
      </header>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-6">
        {isLoading ? <SkeletonRow height={440} /> : isError ? (
          <ErrorState title="Tu QR no cargó" description="Revisa tu conexión y vuelve a intentarlo." onRetry={() => refetch()} />
        ) : (
          <article aria-label="Pase de acceso HIVE" className="rounded-[26px] bg-inverse p-5 text-inverse-foreground">
            <header className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.15em] text-inverse-muted">Titular</p>
                <p className="mt-1 break-words font-bold">{pass.user_name || "Tu pase HIVE"}</p>
                {membership?.plan_name && <p className="mt-1 text-sm text-inverse-muted">{membership.plan_name}</p>}
              </div>
              <BrandLogo variant="mark" size={44} className="shrink-0 text-inverse-foreground" />
            </header>
            <div className="mt-5 grid place-items-center rounded-2xl bg-inverse p-3">
              {qr ? <QRCodeSVG value={qr} size={272} marginSize={4} bgColor={DARK.inverse} fgColor={DARK.onInverse} className="h-auto w-full max-w-[272px]" title="Tu código QR de check-in" /> : (
                <div className="py-12 text-center">
                  <p className="text-sm text-inverse-muted">Tu código de check-in aún no está listo.</p>
                  <button type="button" onClick={() => refetch()} className="mt-3 min-h-[44px] px-4 font-bold underline">Reintentar</button>
                </div>
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-inverse-foreground/20 pt-4">
              {membership ? <>
                <div><p className="text-xs uppercase tracking-widest text-inverse-muted">Clases disponibles</p><p className="mt-1 font-bold">{unlimited ? "Ilimitadas" : remaining == null ? "Por confirmar" : `${Math.max(0, Number(remaining))}${limit != null ? ` de ${limit}` : ""}`}</p></div>
                {endDisplay && <div><p className="text-xs uppercase tracking-widest text-inverse-muted">Vence</p><p className="mt-1 font-bold">{endDisplay}</p></div>}
              </> : <Link to="/app/checkout" className="inline-flex min-h-[44px] items-center text-sm font-bold underline underline-offset-4">Sin paquete activo · ver planes</Link>}
            </div>
          </article>
        )}
        {!isLoading && !isError && qr && <>
          <p className="mt-5 text-center text-sm text-ink-muted">Muestra este QR al llegar al estudio.</p>
          <button type="button" onClick={copyCode} className="mx-auto mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line-strong px-5 text-sm font-bold">
            {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : "Copiar código"}
          </button>
        </>}
      </div>
    </main>
  );
}

export default function Wallet() {
  return <ClientAuthGuard requiredRoles={["client"]}><QrPass /></ClientAuthGuard>;
}
