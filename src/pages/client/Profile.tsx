import { useNavigate } from "react-router-dom";
import { FEATURES } from "@/config/features";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import { STUDIO } from "@/lib/studio";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  Tag,
} from "@/components/app/AppShell";
import {
  UserRound,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  MessageCircle,
  FileText,
  FileSignature,
} from "lucide-react";

const Profile = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

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

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Tu cuenta"
          title="Perfil."
        />

        {/* ── Header card ── */}
        <div className="rounded-3xl p-5 sm:p-7 flex items-center gap-5 bg-sunken">
          <div className="relative grid h-20 w-20 sm:h-24 sm:w-24 place-items-center rounded-full overflow-hidden text-[1.2rem] font-bold shrink-0 bg-inverse text-inverse-foreground">
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
              className="font-display leading-tight truncate text-ink"
              style={{ fontSize: "clamp(1.55rem, 2.6vw, 2.1rem)" }}
            >
              {fullName}
            </h2>
            {email && (
              <p className="text-[0.86rem] mt-1 truncate text-ink-muted">
                {email}
              </p>
            )}
            {phone && (
              <p className="nums text-[0.82rem] mt-0.5 truncate text-ink-muted">
                {phone}
              </p>
            )}
            <div className="mt-3">
              <Tag tint="accent">{roleLabel}</Tag>
            </div>
          </div>
        </div>

        {/* ── Cuenta ── */}
        <Section title="Cuenta">
          <ListGroup>
            <ListRow
              to="/app/profile/edit"
              icon={<UserRound size={17} strokeWidth={1.7} />}
              iconTint="accent"
              title="Editar perfil"
              description="Nombre, foto, contacto"
            />
            {FEATURES.membershipDetail && (
              <ListRow
                to="/app/profile/membership"
                icon={<CreditCard size={17} strokeWidth={1.7} />}
                iconTint="success"
                title="Mi membresía"
                description="Plan, vigencia, clases por usar"
              />
            )}
            <ListRow
              to="/app/orders"
              icon={<FileText size={17} strokeWidth={1.7} />}
              iconTint="accent"
              title="Mis órdenes"
              description="Historial de compras"
            />
            <ListRow
              to="/app/profile/responsiva"
              icon={<FileSignature size={17} strokeWidth={1.7} />}
              iconTint="success"
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
              iconTint="accent"
              title="Notificaciones y privacidad"
              description="Recordatorios, novedades y datos"
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
              iconTint="success"
              title="Escríbenos por WhatsApp"
              description="Respondemos rápido"
            />
            <ListRow
              to="/legal/terminos"
              icon={<HelpCircle size={17} strokeWidth={1.7} />}
              iconTint="accent"
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

        <p className="nums mt-12 text-[0.75rem] uppercase tracking-[0.18em] text-ink-muted">
          HIVE Pilates Studio · {new Date().getFullYear()}
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Profile;
