import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { FEATURES } from "@/config/features";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { canSeeFinance, roleLabel } from "@/lib/roles";
import {
  LayoutDashboard, Package, CreditCard, Users, CalendarDays,
  BookOpen, DollarSign,
  ShoppingCart, BarChart2, Bell, MessageCircle, Award, Percent,
  Settings, ChevronLeft, ArrowLeft, LogOut, Globe, Menu, X, Search,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import AdminTopBar from "./AdminTopBar";
import ClientSearch from "./ClientSearch";
import { Avatar } from "./PersonCell";

const NAV_GROUPS = [
  {
    label: "",
    collapsible: false,
    items: [
      { path: "/admin/dashboard", label: "Inicio", icon: LayoutDashboard },
      { path: "/admin/bookings", label: "Reservas", icon: BookOpen, aliases: ["/admin/pasar-lista"] },
      { path: "/admin/classes", label: "Clases", icon: CalendarDays, aliases: ["/admin/class-types", "/admin/class-generator"] },
      { path: "/admin/payments", label: "Cobros", icon: DollarSign, ownerOnly: true, aliases: ["/admin/orders"] },
      { path: "/admin/clients", label: "Personas", icon: Users, aliases: ["/admin/staff", "/admin/visitas"] },
    ],
  },
  {
    label: "Más",
    collapsible: false,
    items: [
      { path: "/admin/notifications", label: "Bandeja", icon: Bell, feature: "adminInbox" },
      { path: "/admin/memberships", label: "Membresías", icon: CreditCard },
      { path: "/admin/plans", label: "Planes", icon: Package },
      { path: "/admin/pos", label: "Tienda", icon: ShoppingCart, feature: "pos" },
      { path: "/admin/reports", label: "Reportes", icon: BarChart2, ownerOnly: true },
      { path: "/admin/loyalty", label: "Lealtad", icon: Award, feature: "loyalty" },
      { path: "/admin/discount-codes", label: "Descuentos", icon: Percent },
    ],
  },
  {
    label: "Sistema",
    collapsible: false,
    items: [
      { path: "/admin/settings?tab=whatsapp", label: "WhatsApp", icon: MessageCircle, feature: "whatsappTemplates" },
      { path: "/admin/settings", label: "Configuración", icon: Settings },
      { path: "/admin/settings/platforms", label: "Wellhub", icon: Package, feature: "partnerPlatforms" },
      { path: "/admin/bookings/partners-checkins", label: "Check-ins Wellhub", icon: BookOpen , feature: "partnerPlatforms" },
    ],
  },
];

const MOBILE_QUICK_NAV = [
  { path: "/admin/dashboard", label: "Inicio", icon: LayoutDashboard },
  { path: "/admin/bookings", label: "Reservas", icon: BookOpen, aliases: ["/admin/pasar-lista"] },
  { path: "/admin/classes", label: "Clases", icon: CalendarDays, aliases: ["/admin/class-types", "/admin/class-generator"] },
  { path: "/admin/clients", label: "Personas", icon: Users, aliases: ["/admin/staff", "/admin/visitas"] },
  { path: "/admin/payments", label: "Cobros", icon: DollarSign, ownerOnly: true, aliases: ["/admin/orders"] },
];

/* Ítem del menú del panel. La sección activa: línea coral a la izquierda
   sobre canvas (spec §4.5). Coral sólo marca "estás aquí". */
export function adminNavItemClass(active: boolean, compact: boolean): string {
  return cn(
    "flex items-center gap-3 mx-2 my-0.5 rounded-xl transition-colors duration-200 no-underline min-h-[44px]",
    compact ? "px-0 justify-center py-2.5" : "px-3 py-2.5",
    active
      ? "bg-canvas font-semibold text-ink shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]"
      : "text-ink-muted hover:text-ink hover:bg-sunken",
  );
}

const PAYMENTS_PATH = "/admin/payments";
const ICON_BTN =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-sunken hover:text-ink";

/* Contador de atención. Sobre un fondo coral (pestaña activa del celular) va
   en tinta: nunca coral sobre coral (regla 4). Las clases van en líneas
   separadas por la guardia de texto claro sobre coral. */
function PendingBadge({ count, onAccent = false, className, srLabel = "pagos por verificar" }: { count: number; onAccent?: boolean; className?: string; srLabel?: string }) {
  if (count <= 0) return null;
  const tone = onAccent
    ? "bg-ink text-canvas"
    : "bg-accent text-ink";
  return (
    <span className={cn("nums grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.75rem] font-extrabold leading-none", tone, className)}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {srLabel}</span>
    </span>
  );
}

// Cada camino con contador dice de qué es (M11): Cobros son pagos por
// verificar, Bandeja son avisos sin leer — antes el badge de Bandeja repetía
// "pagos por verificar" aunque no tuviera nada que ver.
const srLabelFor = (path: string) => (path === "/admin/notifications" ? "avisos sin leer" : "pagos por verificar");

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user as { id?: string; role?: string; displayName?: string; display_name?: string; email?: string } | null);
  const userName = user?.displayName ?? user?.display_name ?? user?.email ?? "Admin";

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  const showFinance = canSeeFinance(user?.role);
  const navGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i: any) =>
      (showFinance || !i.ownerOnly) && (!i.feature || (FEATURES as any)[i.feature])),
  })).filter((g) => g.items.length > 0);
  const mobileQuickNav = MOBILE_QUICK_NAV.filter((i: any) =>
    (showFinance || !i.ownerOnly) && (!i.feature || (FEATURES as any)[i.feature]));
  const allItems = navGroups.flatMap((g) => g.items);
  // Sub-pantallas que no tienen su propio ítem de menú (Verificar, Pasar
  // lista, Tipos/generador de clase, Coaches) prenden la sección a la que
  // pertenecen en el sidebar, el nav inferior y el título móvil (M2).
  const onOwnOrAlias = (base: string, aliases: string[] | undefined, path: string) =>
    path === base || path.startsWith(base + "/") || (aliases ?? []).some((a) => path === a || path.startsWith(a + "/"));
  const matchPath = (itemPath: string, aliases?: string[]) => {
    const basePath = itemPath.split("?")[0];
    return onOwnOrAlias(basePath, aliases, location.pathname);
  };
  const currentItem = allItems.find((i) => matchPath(i.path, (i as { aliases?: string[] }).aliases));
  const isCompact = collapsed && !mobileOpen;
  const isClientFile = /^\/admin\/clients\/[^/]+$/.test(location.pathname);

  // Misma llave que Inicio: una sola petición para el contador y las cifras.
  const { data: stats } = useQuery<{ pendingAlerts?: number }>({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
    enabled: !!user?.id && showFinance,
    refetchInterval: 60_000,
  });
  const pending = stats?.pendingAlerts ?? 0;

  const { data: unreadData } = useQuery<{ data: { unread_count: number } }>({
    queryKey: ["admin-notifications-unread-count"],
    queryFn: async () => (await api.get("/admin/notifications/unread-count")).data,
    refetchInterval: 60_000,
    enabled: !!user?.id && FEATURES.adminInbox,
  });
  const unreadCount = unreadData?.data?.unread_count ?? 0;
  const badgeFor = (path: string) => (path === PAYMENTS_PATH ? pending : path === "/admin/notifications" ? unreadCount : 0);

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {mobileOpen && (
        <button aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-line bg-surface transition-transform duration-300",
          "w-[88vw] max-w-[300px] -translate-x-full lg:static lg:translate-x-0",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-[248px]",
        )}
      >
        <div className={cn("flex h-[72px] shrink-0 items-center border-b border-line", isCompact ? "justify-center px-3" : "justify-between px-5")}>
          {!isCompact && <BrandLogo variant="lockup" size={34} />}
          <button onClick={() => setMobileOpen(false)} className={cn(ICON_BTN, "lg:hidden")} aria-label="Cerrar menú">
            <X size={18} />
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(ICON_BTN, "hidden lg:inline-flex")}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            {collapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav aria-label="Secciones del panel" className="flex-1 overflow-y-auto py-3.5 scrollbar-thin">
          {navGroups.map((group) => (
            <div key={group.label || "principal"} className="mb-1">
              {!isCompact && group.label && (
                <p className="px-6 pb-1.5 pt-4 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{group.label}</p>
              )}
              {group.items.map(({ path, label, icon: Icon, aliases }) => {
                const active = matchPath(path, aliases);
                const badge = badgeFor(path);
                const srLabel = srLabelFor(path);
                return (
                  <Link
                    key={path}
                    to={path}
                    data-press
                    title={isCompact ? label : undefined}
                    className={adminNavItemClass(active, isCompact)}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="relative inline-flex shrink-0">
                      <Icon size={18} />
                      {isCompact && <PendingBadge count={badge} srLabel={srLabel} className="absolute -right-2.5 -top-2" />}
                    </span>
                    {!isCompact && <span className="truncate text-sm leading-none">{label}</span>}
                    {!isCompact && <PendingBadge count={badge} srLabel={srLabel} className="ml-auto" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={cn("flex shrink-0 items-center gap-2 border-t border-line px-3 py-3", isCompact && "flex-col")}>
          <Avatar name={userName} size={36} />
          {!isCompact && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-bold text-ink">{userName}</p>
              <p className="text-[0.75rem] text-ink-muted">{roleLabel(user?.role)}</p>
            </div>
          )}
          <Link to="/" aria-label="Ver sitio" title="Ver sitio" className={ICON_BTN}>
            <Globe size={16} />
          </Link>
          <button type="button" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión" className={ICON_BTN}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar className="hidden lg:flex" />

        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 lg:hidden">
          {isClientFile ? (
            <Link to="/admin/clients" aria-label="Volver a Clientas" className={ICON_BTN}>
              <ArrowLeft size={20} />
            </Link>
          ) : (
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" className={ICON_BTN}>
              <Menu size={20} />
            </button>
          )}
          {!isClientFile && <BrandLogo variant="mark" size={26} />}
          <span className="min-w-0 truncate text-[17px] font-extrabold text-ink">
            {isClientFile ? "Ficha de clienta" : currentItem?.label ?? "Panel"}
          </span>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Abrir buscador de clientas"
            aria-expanded={searchOpen}
            className={cn(ICON_BTN, "ml-auto border border-line-strong text-ink")}
          >
            <Search size={18} />
          </button>
          <Avatar name={userName} size={36} />
        </header>
        {searchOpen && (
          <div className="border-b border-line bg-surface px-3 py-3 lg:hidden">
            <ClientSearch autoFocus label="Buscar clienta (celular)" onSelect={(c) => navigate(`/admin/clients/${c.id}`)} />
          </div>
        )}

        <main className="admin-mobile-main flex-1 overflow-auto bg-canvas pb-[96px] lg:pb-0">{children}</main>

        {isMobile && (
          <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe lg:hidden">
            <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobileQuickNav.length}, minmax(0, 1fr))` }}>
              {mobileQuickNav.map((item) => {
                const active = matchPath(item.path, item.aliases);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      data-press
                      aria-current={active ? "page" : undefined}
                      className={cn("flex min-h-[64px] flex-col items-center justify-center gap-1 text-[0.75rem] font-bold", active ? "text-ink" : "text-ink-muted")}
                    >
                      <span className={cn("relative inline-flex h-[30px] w-[54px] items-center justify-center rounded-full", active && "bg-accent text-ink")}>
                        <item.icon size={20} />
                        {item.path === PAYMENTS_PATH && <PendingBadge count={pending} onAccent={active} className="absolute -right-1 -top-1.5" />}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
};

export default AdminLayout;
