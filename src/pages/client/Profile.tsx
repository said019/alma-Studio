import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import { STUDIO } from "@/lib/studio";
import { useToast } from "@/hooks/use-toast";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  Tag,
  SkeletonRow,
  ErrorState,
  ALMA,
} from "@/components/app/AppShell";
import {
  UserRound,
  CreditCard,
  Bell,
  ShieldCheck,
  HelpCircle,
  LogOut,
  MessageCircle,
  FileText,
  FileSignature,
  Copy,
  Check,
} from "lucide-react";

const Profile = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Misma query/clave que Wallet: una sola fuente de verdad para el QR
  // de check-in (wallet.qr_code), nunca un código alterno.
  const {
    data: walletData,
    isLoading: walletLoading,
    isError: walletError,
    refetch: refetchWallet,
  } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
    enabled: !!user?.id,
  });
  const wallet = walletData?.data ?? walletData ?? null;
  const qrCode: string | null = wallet?.qr_code ?? null;

  const fullName = user?.displayName ?? user?.display_name ?? user?.email?.split("@")[0] ?? "Alumna";
  const firstName = fullName.split(" ")[0];
  const email = user?.email ?? "";
  const phone = user?.phone ?? "";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel =
    user?.role === "client"
      ? user?.gender === "male"
        ? "Alumno"
        : user?.gender === "other"
          ? "Comunidad"
          : "Alumna"
      : (user?.role ?? "Cliente");

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  const handleCopyCode = async () => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      if (navigator.vibrate) navigator.vibrate(40);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({
        title: "No se pudo copiar el código",
        description: "Inténtalo de nuevo, o muestra el QR directamente en recepción.",
        variant: "destructive",
      });
    }
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Tu cuenta"
          title="Perfil."
        />

        {/* ── Header card ── */}
        <div
          className="rounded-3xl p-5 sm:p-7 flex items-center gap-5"
          style={{ backgroundColor: ALMA.blush }}
        >
          <div
            className="relative grid h-20 w-20 sm:h-24 sm:w-24 place-items-center rounded-full overflow-hidden text-[1.2rem] font-bold shrink-0"
            style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}
          >
            {(user?.photoUrl ?? user?.photo_url) ? (
              <img
                src={(user?.photoUrl ?? user?.photo_url)!}
                alt={fullName}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              className="font-display leading-tight truncate"
              style={{ color: ALMA.ink, fontSize: "clamp(1.55rem, 2.6vw, 2.1rem)" }}
            >
              {fullName}
            </h2>
            {email && (
              <p className="text-[0.86rem] mt-1 truncate" style={{ color: ALMA.ink, opacity: 0.65 }}>
                {email}
              </p>
            )}
            {phone && (
              <p className="nums text-[0.82rem] mt-0.5 truncate" style={{ color: ALMA.ink, opacity: 0.55 }}>
                {phone}
              </p>
            )}
            <div className="mt-3">
              <Tag tint="berry">{roleLabel}</Tag>
            </div>
          </div>
        </div>

        {/* ── Mi código de acceso (check-in en recepción) ── */}
        {user?.id && (
          <Section title="Mi código de acceso">
            {walletLoading ? (
              <SkeletonRow height={240} />
            ) : walletError ? (
              <ErrorState
                title="No pudimos cargar tu código"
                description="Revisa tu conexión y vuelve a intentarlo. En recepción también te reciben con tu nombre."
                onRetry={() => refetchWallet()}
              />
            ) : qrCode ? (
              <div
                className="flex flex-col items-center gap-4 rounded-3xl p-6 text-center"
                style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}` }}
              >
                <div
                  className="rounded-2xl p-3"
                  style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}`, colorScheme: "light" }}
                >
                  <QRCodeSVG value={qrCode} size={168} level="M" bgColor={ALMA.cream} fgColor={ALMA.ink} />
                </div>
                <p className="text-[0.78rem] max-w-[38ch]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                  En recepción, muestra este QR a la cámara. Si te lo piden por chat, usa el botón de copiar.
                </p>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  data-press
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-6 text-[0.74rem] font-medium uppercase tracking-[0.18em] transition-colors"
                  style={
                    copied
                      ? { backgroundColor: ALMA.olive, color: ALMA.cream }
                      : { backgroundColor: ALMA.berry, color: ALMA.cream }
                  }
                >
                  {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={13} />}
                  {copied ? "Código copiado" : "Copiar código"}
                </button>
                <span aria-live="polite" className="sr-only">
                  {copied ? "Código copiado al portapapeles" : ""}
                </span>
              </div>
            ) : (
              <p className="py-4 text-[0.88rem] leading-[1.6]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                Tu código se genera al activar tu primer paquete. Mientras tanto, en recepción te recibimos con tu nombre.
              </p>
            )}
          </Section>
        )}

        {/* ── Cuenta ── */}
        <Section title="Cuenta">
          <ListGroup>
            <ListRow
              to="/app/profile/edit"
              icon={<UserRound size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Editar perfil"
              description="Nombre, foto, contacto"
            />
            <ListRow
              to="/app/profile/membership"
              icon={<CreditCard size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Mi membresía"
              description="Plan, vigencia, clases por usar"
            />
            <ListRow
              to="/app/orders"
              icon={<FileText size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Mis órdenes"
              description="Historial de compras"
            />
            <ListRow
              to="/app/profile/security"
              icon={<ShieldCheck size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Seguridad"
              description="Cambia tu contraseña"
            />
            <ListRow
              to="/app/profile/responsiva"
              icon={<FileSignature size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Mi responsiva"
              description="Consentimiento informado firmado"
            />
          </ListGroup>
        </Section>

        {/* ── Preferencias ── */}
        <Section title="Preferencias">
          <ListGroup>
            <ListRow
              to="/app/profile/preferences"
              icon={<Bell size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Notificaciones"
              description="Recordatorios y novedades"
            />
            <ListRow
              to="/legal/privacidad"
              icon={<ShieldCheck size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Privacidad"
              description="Cómo cuidamos tus datos"
            />
          </ListGroup>
        </Section>

        {/* ── Soporte ── */}
        <Section title="Soporte">
          <ListGroup>
            <ListRow
              onClick={() => window.open(`https://wa.me/${STUDIO.whatsapp}`, "_blank", "noopener")}
              asButton
              icon={<MessageCircle size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Escríbenos por WhatsApp"
              description="Respondemos rápido"
            />
            <ListRow
              to="/legal/terminos"
              icon={<HelpCircle size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Términos y condiciones"
            />
          </ListGroup>
        </Section>

        {/* ── Sesión ── */}
        <Section title="Sesión">
          <ListGroup>
            <ListRow
              onClick={handleLogout}
              asButton
              icon={<LogOut size={17} strokeWidth={1.7} />}
              destructive
              title="Cerrar sesión"
              description={`Salir de la cuenta de ${firstName}`}
            />
          </ListGroup>
        </Section>

        <p className="nums mt-12 text-[0.72rem] uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.4 }}>
          Versión Alma · {new Date().getFullYear()}
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Profile;
