import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import {
  Home,
  CalendarDays,
  ClipboardList,
  Wallet as WalletIcon,
  User as UserIcon,
  Bell,
  ChevronRight,
  LogOut,
  ArrowRight,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";

import { resolveToneClass, type Tone } from "@/design/tokens";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { HexPedestal } from "@/components/brand/HexPedestal";

/* ═══════════════════════════════════════════════════════════
   AppShell — /app en oscuro (spec 2026-09-25 §5).
   El color viaja en clases por función (bg-canvas, text-ink…) que leen las
   variables del tema; nada de color en línea (guardia describeZone, src/design/zoneGuard.ts).
   ═══════════════════════════════════════════════════════════ */

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
};
const NAV: readonly NavItem[] = [
  { to: "/app", label: "Inicio", icon: Home, exact: true },
  { to: "/app/classes", label: "Reservar", icon: CalendarDays },
  { to: "/app/bookings", label: "Mis clases", icon: ClipboardList },
  { to: "/app/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/app/profile", label: "Perfil", icon: UserIcon },
];

const isActive = (pathname: string, to: string, exact?: boolean) =>
  exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

const greetByHour = (now = new Date()) => {
  const h = now.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};

type AppShellProps = {
  children: ReactNode;
  /** When true, hide the top greeting strip (page provides its own header). */
  hideGreeting?: boolean;
};

export const AppShell = ({ children, hideGreeting = false }: AppShellProps) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const firstName = (user?.displayName ?? user?.display_name ?? "").split(" ")[0]
    || user?.email?.split("@")[0]
    || "Tú";
  const initials = (user?.displayName ?? user?.display_name ?? user?.email ?? "U")
    .split(" ")
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarUrl = user?.photoUrl ?? user?.photo_url ?? null;
  const avatar = avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials;

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  // Unread badge count para el bell icon
  const { data: unreadData } = useQuery<{ data: { unread_count: number } }>({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => (await api.get("/me/notifications/unread-count")).data,
    refetchInterval: 60_000,
    enabled: !!user?.id,
  });
  const unreadCount = unreadData?.data?.unread_count ?? 0;
  const badge = unreadCount > 9 ? "9+" : String(unreadCount);
  const notifActive = pathname.startsWith("/app/notifications");

  return (
    <div className="relative isolate min-h-screen bg-canvas text-ink lg:grid lg:grid-cols-[260px_1fr]">
      {/* Resplandor cálido del fondo: sólo en oscuro, fijo detrás de todo (regla 5). */}
      <div aria-hidden="true" data-app-glow className="pointer-events-none fixed inset-0 -z-10 hidden dark:block bg-app-glow" />

      {/* ───────────── Sidebar (desktop) ───────────── */}
      <aside className="hidden lg:flex sticky top-0 self-start h-screen flex-col px-6 py-7 border-r border-line bg-canvas/80">
        <Link to="/" className="flex items-center no-underline mb-10 text-accent">
          <BrandLogo variant="lockup" size={40} />
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.to, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={
                  "group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-3.5 min-h-[44px] text-[0.92rem] no-underline transition-colors " +
                  (active ? "bg-accent-soft text-accent-strong font-bold" : "text-ink-muted font-medium hover:bg-surface/70 hover:text-ink")
                }
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
                {active && <ChevronRight size={14} />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 pt-6 flex flex-col gap-1 border-t border-line">
          <Link
            to="/app/notifications"
            aria-current={notifActive ? "page" : undefined}
            className={
              "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-3.5 min-h-[44px] text-[0.88rem] no-underline transition-colors " +
              (notifActive ? "bg-accent-soft text-accent-strong font-bold" : "text-ink-muted hover:bg-surface/70 hover:text-ink")
            }
          >
            <span className="relative inline-flex">
              <Bell size={16} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span data-unread className="nums absolute -top-1.5 -right-1.5 grid place-items-center rounded-full bg-accent-gradient text-accent-foreground text-[0.75rem] font-bold leading-none px-1 min-w-[16px] h-[16px]">
                  {badge}
                </span>
              )}
            </span>
            <span>Notificaciones</span>
            <span aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-auto pt-6 border-t border-line">
          <Link to="/app/profile" className="flex items-center gap-3 no-underline text-ink">
            <span className="grid h-10 w-10 place-items-center rounded-full overflow-hidden bg-inverse text-inverse-foreground text-[0.78rem] font-bold">
              {avatar}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.86rem] font-semibold truncate leading-tight">{firstName}</p>
              <p className="text-[0.75rem] truncate text-ink-muted">{user?.email}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="mt-3 w-full grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl px-3.5 min-h-[44px] text-[0.84rem] cursor-pointer bg-transparent border-0 text-ink-muted transition-colors hover:text-ink"
          >
            <LogOut size={15} strokeWidth={1.8} />
            <span className="text-left">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ───────────── Main column ───────────── */}
      <div className="flex flex-col min-w-0">
        {/* Mobile top bar: logo · campana · avatar */}
        <header className="lg:hidden sticky top-0 z-30 flex h-16 items-center justify-between px-5 border-b border-line bg-canvas/85 backdrop-blur">
          <Link to="/app" aria-label="Inicio" className="flex items-center no-underline text-accent">
            <BrandLogo size={30} />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/app/notifications"
              aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : "Notificaciones"}
              className={"relative grid h-11 w-11 place-items-center rounded-full no-underline text-ink transition-colors " + (notifActive ? "bg-surface/70" : "hover:bg-surface/70")}
            >
              <Bell size={18} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span data-unread className="nums absolute top-1 right-1 grid place-items-center rounded-full bg-accent-gradient text-accent-foreground text-[0.75rem] font-bold leading-none px-1 min-w-[18px] h-[18px]">
                  {badge}
                </span>
              )}
            </Link>
            <Link
              to="/app/profile"
              aria-label="Perfil"
              className="grid h-11 w-11 place-items-center rounded-full overflow-hidden bg-inverse text-inverse-foreground text-[0.75rem] font-bold no-underline"
            >
              {avatar}
            </Link>
          </div>
        </header>

        {/* Greeting strip (hideable per page) */}
        {!hideGreeting && (
          <div className="px-5 sm:px-7 lg:px-12 pt-6 lg:pt-12 pb-1">
            <p className="text-[0.75rem] font-bold uppercase tracking-[0.2em] text-ink-muted">
              {greetByHour(today)}, {firstName}
            </p>
          </div>
        )}

        <main className="flex-1 px-5 sm:px-7 lg:px-12 pt-4 lg:pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-16">
          {children}
        </main>

        {/* Mobile bottom nav: las cinco pestañas reales */}
        <nav
          data-bottom-nav
          className="lg:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-canvas/90 backdrop-blur pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.to, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                data-press
                aria-current={active ? "page" : undefined}
                className="flex min-h-[44px] flex-col items-center justify-center gap-1 py-1 no-underline"
              >
                <span
                  data-nav-icon
                  className={"grid h-8 w-11 place-items-center rounded-2xl transition-colors " + (active ? "bg-accent-gradient text-accent-foreground shadow-accent-glow" : "text-ink-faint")}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span className={"text-[0.75rem] " + (active ? "text-ink font-bold" : "text-ink-faint font-medium")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   Primitives — funcionan en los dos temas (el panel usa algunas).
   ═══════════════════════════════════════════════════════════ */

/* ── PageHeader ── encabezado de la app: etiqueta, título en mayúsculas y
   segunda línea terracota sobre el resplandor (spec 2026-09-25 §5). */
type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  titleAccent?: string;
  subtitle?: string;
  actions?: ReactNode;
};
export const PageHeader = ({ eyebrow, title, titleAccent, subtitle, actions }: PageHeaderProps) => (
  <header className="mb-7 lg:mb-10">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-[0.75rem] font-bold uppercase tracking-[0.16em] text-ink-muted">{eyebrow}</p>}
        <h1
          lang="es"
          className={"font-display font-extrabold uppercase leading-[1.02] tracking-[-0.01em] break-words hyphens-auto text-ink text-[length:clamp(1.5rem,7.2vw,1.75rem)] " + (eyebrow ? "mt-2" : "")}
          /* display-l: 28 px desde 390 px */
        >
          {title}
          {titleAccent && (
            <span className="block mt-1 font-semibold normal-case tracking-normal text-[0.62em] text-accent-strong dark:text-accent">
              {titleAccent}
            </span>
          )}
        </h1>
        {subtitle && <p className="mt-2 text-[0.95rem] leading-[1.5] text-ink-muted max-w-[60ch]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </header>
);

/* ── Section ── */
type SectionProps = {
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
};
export const Section = ({ title, trailing, children, className }: SectionProps) => (
  <section className={"mt-8 lg:mt-10 " + (className ?? "")}>
    {(title || trailing) && (
      <div className="flex items-end justify-between gap-3 pb-3 mb-4 border-b border-line">
        {title && <h2 className="font-sans text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{title}</h2>}
        {trailing && <div className="text-[0.8125rem]">{trailing}</div>}
      </div>
    )}
    {children}
  </section>
);

/* ── ListRow ── fila con divisor; interactiva si recibe `to` u `onClick` */
type ListRowProps = {
  to?: string;
  onClick?: () => void;
  icon?: ReactNode;
  iconTint?: Tone;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  destructive?: boolean;
  asButton?: boolean;
};
export const ListRow = ({ to, onClick, icon, iconTint = "accent", title, description, trailing, destructive, asButton }: ListRowProps) => {
  const t = resolveToneClass(destructive ? "danger" : iconTint);
  const inner = (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4">
      {icon ? (
        <span data-row-icon className={`grid h-10 w-10 place-items-center rounded-xl shrink-0 ring-1 ring-inset ring-line ${t.softBg} ${t.fg}`}>
          {icon}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="min-w-0">
        <div className={"text-[0.95rem] font-semibold leading-tight truncate " + (destructive ? "text-danger" : "text-ink")}>{title}</div>
        {description && <div className="text-[0.8125rem] mt-0.5 truncate text-ink-muted">{description}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-ink-muted">
        {trailing}
        {(to || onClick) && <ChevronRight size={15} className="text-ink-faint" />}
      </div>
    </div>
  );

  const sharedClass = "block w-full text-left no-underline transition-colors text-ink border-t border-line px-4";
  const interactiveClass = sharedClass + " hover:bg-ink/5";

  if (asButton || (onClick && !to)) {
    return (
      <button onClick={onClick} className={interactiveClass + " bg-transparent border-x-0 border-b-0 cursor-pointer"}>
        {inner}
      </button>
    );
  }
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={interactiveClass}>
        {inner}
      </Link>
    );
  }
  return <div className={sharedClass}>{inner}</div>;
};

/* ── ListGroup ── tarjeta que agrupa ListRows; translúcida en oscuro */
export const ListGroup = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[20px] overflow-hidden border border-line bg-surface dark:bg-surface/70 [&>*:first-child]:!border-t-0">
    {children}
  </div>
);

/* ── Stat ── cifra + etiqueta */
type StatProps = {
  value: ReactNode;
  label: string;
  tint?: Tone;
};
export const Stat = ({ value, label, tint = "ink" }: StatProps) => (
  <div className="pt-3 border-t border-line">
    <div className={`font-display font-semibold text-2xl leading-none ${resolveToneClass(tint).fg}`}>{value}</div>
    <div className="text-[0.75rem] font-bold uppercase tracking-[0.12em] mt-1.5 text-ink-muted">{label}</div>
  </div>
);

/* ── Tag ── pill; sólida para disponibilidad (terracota = hay lugar) */
type TagProps = {
  children: ReactNode;
  tint?: Tone;
  variant?: "soft" | "solid";
};
export const Tag = ({ children, tint = "accent", variant = "soft" }: TagProps) => {
  const t = resolveToneClass(tint);
  const tone = variant === "soft"
    ? `${t.softBg} ${t.softFg} ring-1 ring-inset ${t.ring}`
    : `${t.solidBg} ${t.solidFg}` + (tint === "accent" ? " dark:bg-accent-gradient" : "");
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-bold leading-none " + tone}>
      {children}
    </span>
  );
};

/* ── EmptyState ── */
type EmptyStateProps = {
  title: string;
  description?: string;
  ctaLabel?: string;
  ctaTo?: string;
  onCta?: () => void;
  icon?: ReactNode;
};
export const EmptyState = ({ title, description, ctaLabel, ctaTo, onCta, icon }: EmptyStateProps) => (
  <div className="flex flex-col items-start gap-4 py-10">
    <HexPedestal icon={icon} />
    <div>
      <h3 className="font-display font-extrabold uppercase text-[1.25rem] leading-tight text-ink">{title}</h3>
      {description && <p className="mt-2 text-[0.95rem] leading-[1.6] max-w-[44ch] text-ink-muted">{description}</p>}
    </div>
    {ctaLabel && (ctaTo ? <PrimaryButton to={ctaTo}>{ctaLabel}</PrimaryButton> : <PrimaryButton onClick={onCta}>{ctaLabel}</PrimaryButton>)}
  </div>
);

/* ── Botones ── primary en tinta en el panel y en degradado terracota en la
   app (spec 2026-09-25 §5). Todos ≥44 px. */
type CommonBtnProps = {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  size?: "sm" | "md";
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  variant?: "primary" | "accent";
};

export const PrimaryButton = ({ children, loading, loadingLabel, size = "md", to, onClick, disabled, type = "button", className: extra, variant = "primary" }: CommonBtnProps) => {
  const sizeClass = size === "sm" ? "min-h-[44px] px-5 text-[0.85rem]" : "min-h-[48px] px-6 text-[0.9rem]";
  // Deshabilitado: fondo sunken y tinta tenue. Cargando conserva su color.
  const tone = disabled && !loading
    ? "bg-sunken text-ink-faint"
    : variant === "accent"
      ? "bg-accent text-accent-foreground dark:bg-accent-gradient dark:shadow-accent-glow"
      : "bg-ink text-canvas dark:bg-accent-gradient dark:text-accent-foreground dark:shadow-accent-glow";
  const className = `group inline-flex items-center justify-center gap-2 rounded-full font-bold no-underline transition-transform motion-safe:hover:-translate-y-px disabled:translate-y-0 ${sizeClass} ${tone} ${extra ?? ""}`;
  const inner = loading ? <>{loadingLabel ?? "Cargando…"}</> : (
    <>
      {children}
      <ArrowRight size={15} className="transition-transform motion-safe:group-hover:translate-x-0.5" />
    </>
  );
  if (to) return <Link to={to} data-press className={className} onClick={onClick}>{inner}</Link>;
  return (
    <button type={type} data-press className={className} onClick={onClick} disabled={disabled || loading}>
      {inner}
    </button>
  );
};

type GhostButtonProps = CommonBtnProps & { tone?: "default" | "danger" };

export const GhostButton = ({ children, to, onClick, disabled, type = "button", className: extra, tone = "default" }: GhostButtonProps) => {
  const toneClass = tone === "danger" ? "text-danger ring-danger/60" : "text-ink ring-line-strong";
  const className = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-surface dark:bg-surface/70 px-5 text-[0.85rem] font-bold no-underline ring-[1.5px] ring-inset transition-colors hover:bg-sunken ${toneClass} ${extra ?? ""}`;
  if (to) return <Link to={to} data-press className={className} onClick={onClick}>{children}</Link>;
  return <button type={type} data-press className={className} onClick={onClick} disabled={disabled}>{children}</button>;
};

/* ── ActionRow ── tarjeta de acción amplia (p. ej. "tu próxima clase") */
type ActionRowProps = {
  to?: string;
  onClick?: () => void;
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  rightLabel?: string;
  tint?: Tone;
};
export const ActionRow = ({ to, onClick, eyebrow, title, meta, rightLabel, tint = "accent" }: ActionRowProps) => {
  const t = resolveToneClass(tint);
  const arrow = tint === "accent"
    ? "bg-accent text-accent-foreground dark:bg-accent-gradient dark:shadow-accent-glow"
    : `${t.solidBg} ${t.solidFg}`;
  const inner = (
    <div className="grid grid-cols-[1fr_auto] items-center gap-5 px-5 py-5 sm:px-6 sm:py-6 rounded-[20px] border border-line bg-surface dark:bg-surface/70 transition-transform motion-safe:hover:-translate-y-px">
      <div className="min-w-0">
        {eyebrow && <p className={`text-[0.75rem] font-bold uppercase tracking-[0.12em] ${t.fg}`}>{eyebrow}</p>}
        <div className="font-display font-semibold text-[1.25rem] sm:text-[1.5rem] leading-tight mt-1 text-ink">{title}</div>
        {meta && <p className="text-[0.875rem] mt-1 text-ink-muted">{meta}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {rightLabel && <span className={`hidden sm:inline-block text-[0.75rem] font-bold uppercase tracking-[0.12em] ${t.fg}`}>{rightLabel}</span>}
        <span data-testid="action-row-arrow" className={`grid h-11 w-11 place-items-center rounded-full ${arrow}`}>
          <ArrowUpRight size={16} />
        </span>
      </div>
    </div>
  );
  if (to) {
    return <Link to={to} className="block no-underline">{inner}</Link>;
  }
  return (
    <button onClick={onClick} className="block w-full text-left bg-transparent border-0 p-0 cursor-pointer">
      {inner}
    </button>
  );
};

/* ── SkeletonRow ── visible sobre canvas y sobre surface en los dos temas */
export const SkeletonRow = ({ height = 64 }: { height?: number }) => (
  <div aria-hidden="true" className="rounded-2xl overflow-hidden relative bg-line" style={{ height }}>
    <span className="absolute inset-0 motion-safe:animate-pulse bg-sunken" />
  </div>
);

/* ── ErrorState ── honesto, con reintento */
type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
};
export const ErrorState = ({
  title = "Algo no salió bien",
  description = "No pudimos cargar esta información. Revisa tu conexión y vuelve a intentarlo.",
  onRetry,
  retryLabel = "Reintentar",
}: ErrorStateProps) => (
  <div role="alert" className="flex flex-col items-start gap-4 py-10">
    <HexPedestal tone="danger" icon={<AlertCircle size={20} strokeWidth={1.8} />} />
    <div>
      <h3 className="font-display font-extrabold uppercase text-[1.25rem] leading-tight text-ink">{title}</h3>
      <p className="mt-2 text-[0.95rem] leading-[1.6] max-w-[44ch] text-ink-muted">{description}</p>
    </div>
    {onRetry && <GhostButton onClick={onRetry}>{retryLabel}</GhostButton>}
  </div>
);
