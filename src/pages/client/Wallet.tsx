import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  PrimaryButton,
  SkeletonRow,
  ErrorState,
  ALMA,
} from "@/components/app/AppShell";
import { InfoBanner } from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import {
  Gift,
  History,
  RefreshCw,
  CalendarDays,
  ScanQrCode,
  Copy,
  Check,
} from "lucide-react";

/* Logos oficiales sin recolorear: la "G" de Google con sus colores
   oficiales y la manzana de Apple en blanco, ambos sobre el badge
   negro oficial de cada wallet. */
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const AppleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="#FFFFFF" />
  </svg>
);

/* Badge oficial de wallet: pill negro, texto blanco. Los hex son del
   lockup oficial de Google/Apple, no de la paleta Alma. */
const walletBadgeClass =
  "flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full px-5 no-underline transition-transform hover:-translate-y-px cursor-pointer border-0";
const walletBadgeStyle = { backgroundColor: "#000000", color: "#FFFFFF" } as const;

type Membership = {
  plan_name?: string | null;
  class_limit?: number | null;
  classes_remaining?: number | null;
  start_date?: string | null;
  end_date?: string | null;
};

type WalletData = {
  user_name?: string;
  points?: number;
  qr_code?: string;
  membership?: Membership | null;
  next_booking?: {
    class_name?: string | null;
    instructor_name?: string | null;
    date?: string | null;
    start_time?: string | null;
  } | null;
};

const formatShortDate = (value?: string | null) => {
  if (!value) return "Sin fecha";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
};

/* Hairline interna del pase drenched */
const PASS_HAIRLINE = "1px solid rgba(250,249,246,0.14)";

const Wallet = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [appleLoading, setAppleLoading] = useState(false);
  const [gwRetrying, setGwRetrying] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
  });
  const wallet: WalletData | null = data?.data ?? data ?? null;

  const metrics = useMemo(() => {
    const m = wallet?.membership;
    if (!m) {
      return {
        hasMembership: false,
        isUnlimited: false,
        total: 0,
        remaining: 0,
        used: 0,
        planName: "Sin paquete activo",
      };
    }
    const isUnlimited = m.class_limit === null || Number(m.class_limit) >= 9999;
    const total = isUnlimited ? 0 : Math.max(0, Number(m.class_limit || 0));
    const remaining = isUnlimited ? 0 : Math.max(0, Number(m.classes_remaining ?? total));
    const used = total > 0 ? Math.max(0, total - remaining) : 0;
    return {
      hasMembership: true,
      isUnlimited,
      total,
      remaining,
      used,
      planName: m.plan_name || "Sin paquete activo",
    };
  }, [wallet?.membership]);

  const { data: gwData, isLoading: gwLoading } = useQuery({
    queryKey: ["google-wallet-save"],
    queryFn: async () => {
      const resp = await api.get("/wallet/google/save-url");
      return resp.data?.data ?? resp.data ?? null;
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000,
  });
  const googleSaveUrl = gwData?.saveUrl || null;

  const handleGoogleRetry = async () => {
    setGwRetrying(true);
    try {
      await qc.invalidateQueries({ queryKey: ["google-wallet-save"] });
    } finally {
      setTimeout(() => setGwRetrying(false), 1200);
    }
  };

  const handleCopyCode = async () => {
    const code = wallet?.qr_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      if (navigator.vibrate) navigator.vibrate(40);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1800);
    } catch {
      toast({
        title: "No se pudo copiar el código.",
        description: "Intenta de nuevo o muestra el QR en recepción.",
        variant: "destructive",
      });
    }
  };

  const handleAppleWalletDownload = async () => {
    setAppleLoading(true);
    try {
      const resp = await api.get("/wallet/apple/pkpass", { responseType: "blob" });
      const contentType = resp.headers?.["content-type"] || "";
      if (contentType.includes("application/vnd.apple.pkpass")) {
        const blob = new Blob([resp.data], { type: "application/vnd.apple.pkpass" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "alma-pass.pkpass";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);
        toast({ title: "Pase descargado", description: "Ábrelo para agregarlo a Apple Wallet." });
      } else {
        toast({ title: "Pase no disponible", description: "Inténtalo de nuevo en un momento.", variant: "destructive" });
      }
    } catch {
      toast({ title: "No se pudo descargar el pase.", variant: "destructive" });
    } finally {
      setAppleLoading(false);
    }
  };

  const passStats = [
    { label: "Por usar", value: metrics.isUnlimited ? "∞" : String(metrics.remaining) },
    { label: "Vence", value: formatShortDate(wallet?.membership?.end_date) },
    { label: "Puntos", value: (wallet?.points ?? 0).toLocaleString("es-MX") },
  ];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Tu pase"
          title={<>Tu pase</>}
          titleAccent="del estudio."
          subtitle="Tu membresía y un QR para hacer check-in al llegar al estudio."
        />

        {isLoading ? (
          <Section>
            <SkeletonRow height={420} />
          </Section>
        ) : isError ? (
          <Section>
            <ErrorState
              title="Tu pase no cargó"
              description="No pudimos traer tu pase del estudio. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          </Section>
        ) : (
          <Section>
            {/* ── El pase: una sola pieza drenched ── */}
            <article
              className="overflow-hidden rounded-[1.75rem]"
              style={{
                backgroundColor: ALMA.inkDeep,
                color: ALMA.cream,
                boxShadow: "0 18px 48px -12px rgba(36,27,26,0.18)",
              }}
            >
              {/* Wordmark + estado */}
              <header className="flex items-start justify-between gap-4 px-6 pb-5 pt-6 sm:px-7">
                <div className="min-w-0">
                  <p className="font-display text-[1.4rem] leading-none" style={{ color: ALMA.cream }}>
                    Alma <span className="font-display-italic">Movement</span>
                  </p>
                  <p
                    className="mt-2 text-[0.72rem] uppercase tracking-[0.22em]"
                    style={{ color: ALMA.cream, opacity: 0.6 }}
                  >
                    Pase del estudio
                  </p>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 pt-1 text-[0.72rem] font-medium uppercase tracking-[0.18em]"
                  style={{ color: ALMA.cream, opacity: metrics.hasMembership ? 0.92 : 0.6 }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: metrics.hasMembership ? ALMA.olive : "rgba(250,249,246,0.4)" }}
                  />
                  {metrics.hasMembership ? "Activo" : "Sin paquete"}
                </span>
              </header>

              {/* Titular y plan */}
              <div className="px-6 py-5 sm:px-7" style={{ borderTop: PASS_HAIRLINE }}>
                <p className="text-[0.72rem] uppercase tracking-[0.22em]" style={{ color: ALMA.cream, opacity: 0.55 }}>
                  Titular
                </p>
                <p
                  className="font-display mt-1.5 leading-tight"
                  style={{ color: ALMA.cream, fontSize: "clamp(1.35rem, 4.5vw, 1.6rem)" }}
                >
                  {wallet?.user_name || "Tu pase"}
                </p>
                <p className="mt-1 text-[0.84rem]" style={{ color: ALMA.cream, opacity: 0.7 }}>
                  {metrics.planName}
                </p>
              </div>

              {/* Datos del pase: número + label, hairlines internas */}
              <div className="grid grid-cols-3 px-6 sm:px-7" style={{ borderTop: PASS_HAIRLINE }}>
                {passStats.map((s, i) => (
                  <div
                    key={s.label}
                    className="min-w-0 py-4"
                    style={i > 0 ? { borderLeft: PASS_HAIRLINE, paddingLeft: "1rem" } : undefined}
                  >
                    <p className="text-[0.72rem] uppercase tracking-[0.18em]" style={{ color: ALMA.cream, opacity: 0.55 }}>
                      {s.label}
                    </p>
                    <p
                      className="nums font-display mt-1.5 truncate leading-none"
                      style={{ color: ALMA.cream, fontSize: "1.3rem" }}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Próxima clase como dato del pase, sin caja anidada */}
              {wallet?.next_booking && (
                <div className="px-6 py-4 sm:px-7" style={{ borderTop: PASS_HAIRLINE }}>
                  <p className="text-[0.72rem] uppercase tracking-[0.22em]" style={{ color: ALMA.cream, opacity: 0.55 }}>
                    Próxima clase
                  </p>
                  <p className="mt-1 truncate text-[0.92rem]" style={{ color: ALMA.cream }}>
                    {wallet.next_booking.class_name || "Clase"}
                    <span className="nums" style={{ opacity: 0.7 }}>
                      {" "}· {formatShortDate(wallet.next_booking.date)}, {String(wallet.next_booking.start_time || "").slice(0, 5)}
                    </span>
                  </p>
                </div>
              )}

              {/* QR integrado sobre superficie cream (segundo y último nivel) */}
              {wallet?.qr_code && (
                <div
                  className="flex items-center gap-5 px-6 py-5 sm:px-7"
                  style={{ backgroundColor: ALMA.cream, color: ALMA.ink }}
                >
                  <QRCodeSVG
                    value={wallet.qr_code}
                    size={96}
                    bgColor={ALMA.cream}
                    fgColor={ALMA.inkDeep}
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <p
                      className="flex items-center gap-1.5 text-[0.72rem] font-medium uppercase tracking-[0.2em]"
                      style={{ color: ALMA.berry }}
                    >
                      <ScanQrCode size={13} />
                      Check-in en recepción
                    </p>
                    <p className="mt-1.5 text-[0.82rem] leading-[1.5]" style={{ color: ALMA.ink, opacity: 0.65 }}>
                      Muéstralo al llegar. Si te lo piden por chat, cópialo y mándalo.
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border-0 px-4 text-[0.74rem] font-medium uppercase tracking-[0.16em] transition-colors"
                      style={
                        codeCopied
                          ? { backgroundColor: ALMA.olive, color: ALMA.cream }
                          : { backgroundColor: ALMA.ink, color: ALMA.cream }
                      }
                    >
                      {codeCopied
                        ? <><Check size={13} /> Copiado</>
                        : <><Copy size={13} /> Copiar código</>}
                    </button>
                  </div>
                </div>
              )}
            </article>
          </Section>
        )}

        {/* Agregar al teléfono: badges oficiales */}
        <Section title="Agregar a tu teléfono">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {gwLoading || gwRetrying ? (
              <div
                className="flex min-h-[52px] items-center justify-center gap-3 rounded-full"
                style={{ backgroundColor: ALMA.mist, color: ALMA.ink, opacity: 0.65 }}
              >
                <RefreshCw size={15} className="animate-spin" />
                <span className="text-[0.84rem]">Cargando Google Wallet…</span>
              </div>
            ) : googleSaveUrl ? (
              <a
                href={googleSaveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={walletBadgeClass}
                style={walletBadgeStyle}
              >
                <GoogleLogo />
                <span className="text-[0.86rem] font-medium">Agregar a Google Wallet</span>
              </a>
            ) : (
              <button
                onClick={handleGoogleRetry}
                className="flex min-h-[52px] cursor-pointer items-center justify-center gap-3 rounded-full bg-transparent transition-colors"
                style={{ border: `1px dashed ${ALMA.sandstone}`, color: ALMA.ink, opacity: 0.75 }}
              >
                <span className="text-[0.84rem]">Reintentar Google Wallet</span>
                <RefreshCw size={13} />
              </button>
            )}

            <button
              onClick={handleAppleWalletDownload}
              disabled={appleLoading}
              className={walletBadgeClass + " disabled:opacity-60"}
              style={walletBadgeStyle}
            >
              <AppleLogo />
              <span className="text-[0.86rem] font-medium">
                {appleLoading ? "Preparando…" : "Agregar a Apple Wallet"}
              </span>
            </button>
          </div>
        </Section>

        {/* Accesos: lista editorial, no pills */}
        <Section title="Tus puntos y reservas">
          <ListGroup>
            <ListRow
              to="/app/wallet/history"
              icon={<History size={17} strokeWidth={1.7} />}
              title="Historial de puntos"
              description="Movimiento a movimiento"
            />
            <ListRow
              to="/app/wallet/rewards"
              icon={<Gift size={17} strokeWidth={1.7} />}
              title="Canjear puntos"
              description="Las recompensas del estudio"
            />
            <ListRow
              to="/app/classes"
              icon={<CalendarDays size={17} strokeWidth={1.7} />}
              title="Reservar clase"
              description="Encuentra tu próximo horario"
            />
          </ListGroup>
        </Section>

        {!isLoading && !isError && !metrics.hasMembership && (
          <Section>
            <InfoBanner
              tone="stone"
              title="Aún no activas un paquete."
              description="Compra uno y tu pase se activa automáticamente."
              action={<PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>}
            />
          </Section>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Wallet;
