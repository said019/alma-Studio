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

import { ALMA } from "@/components/app/tokens";
import almaMark from "@/assets/alma/alma-mark.png";
export { ALMA };

/* ═══════════════════════════════════════════════════════════
   AppShell — /app layout: sidebar desktop + bottom-nav mobile
   Active state: single berry tint, no rainbow.
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

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]" style={{ backgroundColor: ALMA.cream, color: ALMA.ink }}>
      {/* ───────────── Sidebar (desktop) ───────────── */}
      <aside
        className="hidden lg:flex sticky top-0 self-start h-screen flex-col px-6 py-7"
        style={{ borderRight: `1px solid ${ALMA.border}`, backgroundColor: ALMA.cream }}
      >
        <Link to="/" className="flex items-center no-underline mb-10">
          <img
            src={almaMark}
            alt="Alma Movement"
            className="h-12 w-auto object-contain"
          />
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
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[0.92rem] no-underline transition-colors"
                style={{
                  backgroundColor: active ? ALMA.blush : "transparent",
                  color: active ? ALMA.berry : ALMA.ink,
                  fontWeight: active ? 600 : 500,
                }}
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
                {active && <ChevronRight size={14} style={{ color: ALMA.berry, opacity: 0.6 }} />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 pt-6 flex flex-col gap-1" style={{ borderTop: `1px solid ${ALMA.border}` }}>
          <Link
            to="/app/notifications"
            aria-current={pathname.startsWith("/app/notifications") ? "page" : undefined}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[0.88rem] no-underline transition-colors"
            style={{
              color: pathname.startsWith("/app/notifications") ? ALMA.berry : ALMA.ink,
              backgroundColor: pathname.startsWith("/app/notifications") ? ALMA.blush : "transparent",
              opacity: pathname.startsWith("/app/notifications") ? 1 : 0.78,
            }}
          >
            <span className="relative inline-flex">
              <Bell size={16} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span
                  className="nums absolute -top-1.5 -right-1.5 grid place-items-center rounded-full text-[0.7rem] font-semibold leading-none px-1 min-w-[16px] h-[16px]"
                  style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            <span>Notificaciones</span>
            <span aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-auto pt-6" style={{ borderTop: `1px solid ${ALMA.border}` }}>
          <Link
            to="/app/profile"
            className="flex items-center gap-3 no-underline group"
            style={{ color: ALMA.ink }}
          >
            <span
              className="grid h-10 w-10 place-items-center rounded-full overflow-hidden text-[0.78rem] font-bold"
              style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}
            >
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.86rem] font-medium truncate leading-tight">{firstName}</p>
              <p className="text-[0.7rem] truncate" style={{ opacity: 0.55 }}>
                {user?.email}
              </p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="mt-3 w-full grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[0.84rem] cursor-pointer transition-colors"
            style={{ background: "transparent", border: 0, color: ALMA.ink, opacity: 0.65 }}
          >
            <LogOut size={15} strokeWidth={1.8} />
            <span className="text-left">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ───────────── Main column ───────────── */}
      <div className="flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header
          className="lg:hidden sticky top-0 z-30 flex h-16 items-center justify-between px-5"
          style={{
            backgroundColor: ALMA.cream,
            borderBottom: `1px solid ${ALMA.border}`,
          }}
        >
          <Link to="/app" className="flex items-center no-underline">
            <img src={almaMark} alt="Alma Movement" className="h-10 w-auto object-contain" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/app/notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full no-underline transition-colors"
              style={{
                backgroundColor: pathname.startsWith("/app/notifications") ? ALMA.blush : "transparent",
                color: ALMA.ink,
              }}
              aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : "Notificaciones"}
            >
              <Bell size={17} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span
                  className="nums absolute top-0.5 right-0.5 grid place-items-center rounded-full text-[0.7rem] font-semibold leading-none px-1 min-w-[18px] h-[18px]"
                  style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link
              to="/app/profile"
              className="grid h-10 w-10 place-items-center rounded-full overflow-hidden text-[0.74rem] font-bold no-underline"
              style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}
              aria-label="Perfil"
            >
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </Link>
          </div>
        </header>

        {/* Greeting strip (hideable per page) */}
        {!hideGreeting && (
          <div className="px-5 sm:px-7 lg:px-12 pt-7 lg:pt-12 pb-1">
            <p className="text-[0.72rem] uppercase tracking-[0.24em]" style={{ color: ALMA.ink, opacity: 0.55 }}>
              {greetByHour(today)}, {firstName}
            </p>
          </div>
        )}

        <main
          className="flex-1 px-5 sm:px-7 lg:px-12 pt-4 lg:pt-6 pb-28 lg:pb-16"
        >
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5"
          style={{
            backgroundColor: ALMA.cream,
            borderTop: `1px solid ${ALMA.border}`,
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
            paddingTop: "0.5rem",
          }}
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.to, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                data-press
                className="flex flex-col items-center justify-center gap-1 py-1 no-underline"
                aria-current={active ? "page" : undefined}
              >
                <span
                  className="grid h-9 w-9 place-items-center rounded-full transition-colors"
                  style={{
                    backgroundColor: active ? ALMA.berry : "transparent",
                    color: active ? ALMA.cream : ALMA.ink,
                  }}
                >
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span
                  className="text-[0.72rem] tracking-[0.04em]"
                  style={{ color: active ? ALMA.berry : ALMA.ink, opacity: active ? 1 : 0.6, fontWeight: active ? 600 : 500 }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   Primitives
   ═══════════════════════════════════════════════════════════ */

/* ── PageHeader ── */
type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  titleAccent?: string;
  subtitle?: string;
  actions?: ReactNode;
};
export const PageHeader = ({ eyebrow, title, titleAccent, subtitle, actions }: PageHeaderProps) => (
  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-7 lg:mb-10">
    <div>
      {eyebrow && (
        <span className="text-[0.72rem] font-medium uppercase tracking-[0.3em]" style={{ color: ALMA.berry }}>
          {eyebrow}
        </span>
      )}
      <h1
        className={"font-bebas leading-[0.95] tracking-tight " + (eyebrow ? "mt-2" : "")}
        style={{ color: ALMA.ink, fontSize: "clamp(1.85rem, 3.4vw, 2.6rem)" }}
      >
        {title}
        {titleAccent && (
          <span className="block italic font-alilato font-normal" style={{ color: ALMA.berry, fontSize: "0.78em" }}>
            {titleAccent}
          </span>
        )}
      </h1>
      {subtitle && (
        <p className="mt-2 text-[0.92rem] leading-[1.6] max-w-[60ch]" style={{ color: ALMA.ink, opacity: 0.65 }}>
          {subtitle}
        </p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
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
      <div
        className="flex items-end justify-between gap-3 pb-3 mb-4"
        style={{ borderBottom: `1px solid ${ALMA.border}` }}
      >
        {title && (
          <h2
            className="text-[0.72rem] font-medium uppercase tracking-[0.24em]"
            style={{ color: ALMA.ink, opacity: 0.65 }}
          >
            {title}
          </h2>
        )}
        {trailing && <div className="text-[0.78rem]">{trailing}</div>}
      </div>
    )}
    {children}
  </section>
);

/* ── ListRow ── iOS-settings-style hairline row */
type ListRowProps = {
  to?: string;
  onClick?: () => void;
  icon?: ReactNode;
  iconTint?: keyof typeof ALMA;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  destructive?: boolean;
  asButton?: boolean;
};
export const ListRow = ({ to, onClick, icon, iconTint = "berry", title, description, trailing, destructive, asButton }: ListRowProps) => {
  const tintColor = destructive ? ALMA.destructive : ALMA[iconTint];
  const inner = (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4">
      {icon ? (
        <span
          className="grid h-10 w-10 place-items-center rounded-2xl shrink-0"
          style={{
            backgroundColor: destructive ? `${ALMA.destructive}10` : ALMA.blush,
            color: tintColor,
          }}
        >
          {icon}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="min-w-0">
        <div
          className="text-[0.94rem] font-medium leading-tight truncate"
          style={{ color: destructive ? ALMA.destructive : ALMA.ink }}
        >
          {title}
        </div>
        {description && (
          <div className="text-[0.78rem] mt-0.5 truncate" style={{ color: ALMA.ink, opacity: 0.55 }}>
            {description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0" style={{ color: ALMA.ink, opacity: 0.4 }}>
        {trailing}
        {(to || onClick) && <ChevronRight size={15} />}
      </div>
    </div>
  );

  const sharedClass = "block w-full text-left no-underline transition-colors";
  // ALMA.mist: hover real para filas interactivas (las estáticas no lo reciben)
  const interactiveClass = sharedClass + " hover:bg-[#F4F1EA]";
  const sharedStyle = { color: ALMA.ink, borderTop: `1px solid ${ALMA.border}` };

  if (asButton || (onClick && !to)) {
    return (
      <button onClick={onClick} className={interactiveClass + " bg-transparent border-0 cursor-pointer px-1"} style={sharedStyle}>
        {inner}
      </button>
    );
  }
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={interactiveClass + " px-1"} style={sharedStyle}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={sharedClass + " px-1"} style={sharedStyle}>
      {inner}
    </div>
  );
};

/* ── ListGroup ── wraps ListRows; closes the bottom hairline */
export const ListGroup = ({ children }: { children: ReactNode }) => (
  <div style={{ borderBottom: `1px solid ${ALMA.border}` }}>{children}</div>
);

/* ── Stat ── number + label, hairline above */
type StatProps = {
  value: ReactNode;
  label: string;
  tint?: keyof typeof ALMA;
};
export const Stat = ({ value, label, tint = "ink" }: StatProps) => (
  <div className="pt-3" style={{ borderTop: `1px solid ${ALMA.border}` }}>
    <div className="nums font-display text-2xl leading-none" style={{ color: ALMA[tint] }}>
      {value}
    </div>
    <div className="text-[0.72rem] uppercase tracking-[0.18em] mt-1.5" style={{ color: ALMA.ink, opacity: 0.55 }}>
      {label}
    </div>
  </div>
);

/* ── Tag ── pill, color-coded */
type TagProps = {
  children: ReactNode;
  tint?: keyof typeof ALMA;
  variant?: "soft" | "solid";
};
export const Tag = ({ children, tint = "berry", variant = "soft" }: TagProps) => {
  const c = ALMA[tint];
  const isSoft = variant === "soft";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.72rem] font-medium uppercase tracking-[0.18em]"
      style={
        isSoft
          ? { backgroundColor: `${c}1a`, color: c }
          : { backgroundColor: c, color: ALMA.cream }
      }
    >
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
    {icon && (
      <span
        className="grid h-12 w-12 place-items-center rounded-2xl"
        style={{ backgroundColor: ALMA.blush, color: ALMA.berry }}
      >
        {icon}
      </span>
    )}
    <div>
      <h3 className="font-bebas text-[1.4rem] leading-tight" style={{ color: ALMA.ink }}>{title}</h3>
      {description && (
        <p className="mt-2 text-[0.92rem] leading-[1.6] max-w-[44ch]" style={{ color: ALMA.ink, opacity: 0.65 }}>
          {description}
        </p>
      )}
    </div>
    {ctaLabel && (ctaTo ? (
      <PrimaryButton to={ctaTo}>{ctaLabel}</PrimaryButton>
    ) : (
      <PrimaryButton onClick={onCta}>{ctaLabel}</PrimaryButton>
    ))}
  </div>
);

/* ── PrimaryButton ── berry pill */
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
};

export const PrimaryButton = ({ children, loading, loadingLabel, size = "md", to, onClick, disabled, type = "button", className: extra }: CommonBtnProps) => {
  const sizeClass = size === "sm" ? "px-5 py-2.5 text-[0.74rem]" : "px-6 py-3 text-[0.78rem]";
  const className =
    `group inline-flex items-center justify-center gap-2 rounded-full font-medium uppercase tracking-[0.18em] no-underline transition-transform hover:-translate-y-px disabled:opacity-60 disabled:translate-y-0 ${sizeClass} ${extra ?? ""}`;
  const style = { backgroundColor: ALMA.berry, color: ALMA.cream } as const;
  const inner = loading ? (
    <>{loadingLabel ?? "Cargando…"}</>
  ) : (
    <>
      {children}
      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
    </>
  );
  if (to) {
    return <Link to={to} data-press className={className} style={style} onClick={onClick}>{inner}</Link>;
  }
  return (
    <button type={type} data-press className={className} style={style} onClick={onClick} disabled={disabled || loading}>
      {inner}
    </button>
  );
};

/* ── GhostButton ── secondary, no fill */
export const GhostButton = ({ children, to, onClick, disabled, type = "button", className: extra }: CommonBtnProps) => {
  const className =
    `inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.74rem] font-medium uppercase tracking-[0.18em] no-underline transition-colors ${extra ?? ""}`;
  const style = { border: `1px solid ${ALMA.border}`, color: ALMA.ink } as const;
  if (to) {
    return <Link to={to} data-press className={className} style={style} onClick={onClick}>{children}</Link>;
  }
  return <button type={type} data-press className={className} style={style} onClick={onClick} disabled={disabled}>{children}</button>;
};

/* ── ActionRow ── full-width wide CTA, used in Dashboard "next class" */
type ActionRowProps = {
  to?: string;
  onClick?: () => void;
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  rightLabel?: string;
  tint?: keyof typeof ALMA;
};
export const ActionRow = ({ to, onClick, eyebrow, title, meta, rightLabel, tint = "berry" }: ActionRowProps) => {
  const c = ALMA[tint];
  // stone/sandstone fallan AA en texto pequeño sobre blush; el texto chico se clava en berry
  const textTint = tint === "stone" || tint === "coral" || tint === "sandstone" ? ALMA.berry : c;
  const inner = (
    <div className="grid grid-cols-[1fr_auto] items-center gap-5 px-5 py-5 sm:px-6 sm:py-6 rounded-3xl transition-transform hover:-translate-y-px"
      style={{ backgroundColor: ALMA.blush }}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.24em]" style={{ color: textTint }}>
            {eyebrow}
          </p>
        )}
        <div className="font-bebas text-[1.55rem] sm:text-[1.85rem] leading-tight mt-1" style={{ color: ALMA.ink }}>
          {title}
        </div>
        {meta && (
          <p className="text-[0.84rem] mt-1" style={{ color: ALMA.ink, opacity: 0.6 }}>
            {meta}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {rightLabel && (
          <span className="hidden sm:inline-block text-[0.72rem] uppercase tracking-[0.2em]" style={{ color: textTint }}>
            {rightLabel}
          </span>
        )}
        <span className="grid h-11 w-11 place-items-center rounded-full" style={{ backgroundColor: c, color: ALMA.cream }}>
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

/* ── SkeletonRow ── placeholder de carga, visible sobre cualquier superficie
   (cream, mist o blush). Base sandstone al 35% + pulso sutil de opacidad;
   motion-safe lo apaga con prefers-reduced-motion. */
export const SkeletonRow = ({ height = 64 }: { height?: number }) => (
  <div
    aria-hidden="true"
    className="rounded-2xl overflow-hidden relative"
    style={{ backgroundColor: "rgba(203,185,164,0.35)", height }}
  >
    <span
      className="absolute inset-0 motion-safe:animate-pulse"
      style={{ backgroundColor: "rgba(203,185,164,0.4)" }}
    />
  </div>
);

/* ── ErrorState ── error de página: honesto, con reintento.
   Mismo lenguaje que EmptyState, tinte destructive sutil solo en el tile. */
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
    <span
      className="grid h-12 w-12 place-items-center rounded-2xl"
      style={{ backgroundColor: `${ALMA.destructive}12`, color: ALMA.destructive }}
    >
      <AlertCircle size={20} strokeWidth={1.8} />
    </span>
    <div>
      <h3 className="font-display text-[1.4rem] leading-tight" style={{ color: ALMA.ink }}>{title}</h3>
      <p className="mt-2 text-[0.92rem] leading-[1.6] max-w-[44ch]" style={{ color: ALMA.ink, opacity: 0.65 }}>
        {description}
      </p>
    </div>
    {onRetry && <GhostButton onClick={onRetry}>{retryLabel}</GhostButton>}
  </div>
);
