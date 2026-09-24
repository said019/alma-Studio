import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { FEATURES } from "@/config/features";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard, Package, CreditCard, Users, CalendarDays,
  BookOpen, DollarSign,
  ShoppingCart, BarChart2, Bell, MessageCircle, Award, Percent,
  Settings, ChevronLeft, ChevronRight, ChevronDown, LogOut, Globe, Menu, X,
} from "lucide-react";
import almaMark from "@/assets/alma/alma-mark-ink.png";

const NAV_GROUPS = [
  {
    label: "",
    collapsible: false,
    items: [
      { path: "/admin/dashboard", label: "Inicio", icon: LayoutDashboard },
      { path: "/admin/bookings", label: "Reservas", icon: BookOpen },
      { path: "/admin/classes", label: "Clases", icon: CalendarDays },
      { path: "/admin/payments", label: "Cobros", icon: DollarSign, ownerOnly: true },
      { path: "/admin/clients", label: "Personas", icon: Users },
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

// Recepción e instructoras operan el estudio pero no ven dinero: el backend
// devuelve 403 en esas rutas (auditoría 2026-09-08, P1-1), así que tampoco
// deben aparecer en el menú y llevar a una pantalla vacía.
const OWNER_ROLES = ["admin", "super_admin"];
const canSeeFinance = (role?: string) => OWNER_ROLES.includes(String(role ?? ""));

const MOBILE_QUICK_NAV = [
  { path: "/admin/dashboard", label: "Inicio", icon: LayoutDashboard },
  { path: "/admin/bookings", label: "Reservas", icon: BookOpen },
  { path: "/admin/classes", label: "Clases", icon: CalendarDays },
  { path: "/admin/clients", label: "Personas", icon: Users },
  { path: "/admin/payments", label: "Cobros", icon: DollarSign, ownerOnly: true },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Más: false,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user as any);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    logout();
    navigate("/auth/login");
  };

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
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
  const matchPath = (itemPath: string) => {
    const basePath = itemPath.split("?")[0];
    return location.pathname === basePath || location.pathname.startsWith(basePath + "/");
  };
  const currentItem = allItems.find((i) => matchPath(i.path));
  const activeGroup = navGroups.find((g) => g.items.some((i) => matchPath(i.path)));

  const isCompact = collapsed && !mobileOpen;

  // Unread count para badge en sidebar item 'Bandeja'
  const { data: unreadData } = useQuery<{ data: { unread_count: number } }>({
    queryKey: ["admin-notifications-unread-count"],
    queryFn: async () => (await api.get("/admin/notifications/unread-count")).data,
    refetchInterval: 60_000,
    enabled: !!user?.id,
  });
  const unreadCount = unreadData?.data?.unread_count ?? 0;

  return (
    <div className="alma-admin flex min-h-screen bg-canvas text-ink">
      {mobileOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 shrink-0",
          "border-r border-line bg-sunken",
          "w-[88vw] max-w-[300px] -translate-x-full lg:translate-x-0 lg:static",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-[240px]",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-line shrink-0",
            isCompact ? "justify-center px-3 py-5" : "justify-between px-5 py-5",
          )}
        >
          {!isCompact && (
            <img src={almaMark} alt="Alma Movement" className="h-12 w-auto object-contain" />
          )}

          <button
            onClick={() => setMobileOpen(false)}
            className="flex lg:hidden items-center justify-center w-8 h-8 rounded-lg text-ink/55 hover:text-ink hover:bg-sunken/40"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-colors",
              "text-ink/45 hover:text-ink hover:bg-sunken/40",
            )}
            aria-label="Contraer menú"
          >
            {collapsed ? <Menu size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {navGroups.map((group) => {
            const isGroupActive = activeGroup?.label === group.label;
            const isOpen = group.collapsible ? (openGroups[group.label] ?? isGroupActive) : true;

            return (
              <div key={group.label} className="mb-1">
                {!isCompact && group.label && (
                  group.collapsible ? (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-5 py-1.5 group"
                    >
                      <span
                        className={cn(
                          "text-[0.72rem] font-semibold uppercase tracking-[0.14em] transition-colors",
                          isGroupActive ? "text-ink/70" : "text-ink/45",
                        )}
                      >
                        {group.label}
                      </span>
                      <ChevronDown
                        size={11}
                        className={cn(
                          "text-ink/40 transition-transform duration-200",
                          isOpen ? "rotate-0" : "-rotate-90",
                        )}
                      />
                    </button>
                  ) : (
                    <p className="px-5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink/45">
                      {group.label}
                    </p>
                  )
                )}

                {(isCompact || isOpen) && group.items.map(({ path, label, icon: Icon }) => {
                  const active = matchPath(path);
                  return (
                    <Link
                      key={path}
                      to={path}
                      data-press
                      title={isCompact ? label : undefined}
                      className={cn(
                        "flex items-center gap-3 mx-2 my-0.5 rounded-xl transition-colors duration-200 no-underline",
                        isCompact ? "px-0 justify-center py-2.5" : "px-3 py-2.5",
                        active
                          ? "bg-sunken font-semibold text-ink ring-1 ring-inset ring-line-strong/50"
                          : "text-ink/70 hover:text-ink hover:bg-sunken/40",
                      )}
                    >
                      <span className="relative shrink-0 inline-flex">
                        <Icon size={15} />
                        {/* Badge: unread count para 'Bandeja' nav item */}
                        {path === "/admin/notifications" && unreadCount > 0 && (
                          <span className="nums absolute -top-2 -right-2.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-inverse px-1 text-[0.7rem] font-semibold leading-none text-canvas">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </span>
                      {!isCompact && (
                        <span className="text-[13px] leading-none truncate">{label}</span>
                      )}
                    </Link>
                  );
                })}

                {isCompact && <div className="mx-3 my-1 h-px bg-line" />}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line pb-3 pt-2 shrink-0">
          <Link
            to="/"
            title={isCompact ? "Ver sitio" : undefined}
            className={cn(
              "flex items-center gap-3 mx-2 rounded-xl px-3 py-2 no-underline transition-colors",
              "text-ink/60 hover:text-ink hover:bg-sunken/40",
              isCompact && "justify-center px-0",
            )}
          >
            <Globe size={14} className="shrink-0" />
            {!isCompact && <span className="text-xs">Ver sitio</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={isCompact ? "Salir" : undefined}
            className={cn(
              "flex items-center gap-3 mx-2 rounded-xl px-3 py-2 w-[calc(100%-16px)] transition-colors",
              "text-ink/60 hover:text-destructive hover:bg-destructive/10",
              isCompact && "justify-center px-0",
            )}
          >
            <LogOut size={14} className="shrink-0" />
            {!isCompact && <span className="text-xs">Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <header className="shrink-0 h-14 flex items-center justify-between px-3 sm:px-4 lg:px-6 border-b border-line bg-canvas sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink/60 hover:text-ink hover:bg-sunken/40"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={16} />
            </button>
            <span className="text-ink/50 text-[0.72rem] font-medium tracking-[0.12em] uppercase">Admin</span>
            {currentItem && (
              <>
                <ChevronRight size={12} className="text-ink/35 shrink-0" />
                <span className="text-ink text-xs sm:text-sm font-semibold truncate">{currentItem.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-sunken flex items-center justify-center text-[11px] font-semibold text-ink">
              {user?.displayName?.[0]?.toUpperCase() ?? user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "A"}
            </div>
            {!isCompact && (
              <span className="text-xs text-ink/70 hidden md:block truncate max-w-[180px]">
                {user?.displayName ?? user?.display_name ?? user?.email ?? "Admin"}
              </span>
            )}
          </div>
        </header>

        <main className="admin-mobile-main flex-1 overflow-auto pb-[88px] lg:pb-0 bg-canvas">{children}</main>

        {isMobile && (
          <nav className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-line bg-canvas p-1 pb-safe shadow-sm lg:hidden">
            <ul className="grid grid-cols-5 gap-1">
              {mobileQuickNav.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      data-press
                      className={cn(
                        "flex h-12 min-h-[44px] flex-col items-center justify-center rounded-xl text-[11px] font-semibold transition-colors",
                        active
                          ? "bg-sunken text-ink ring-1 ring-inset ring-line-strong/50"
                          : "text-ink/70 hover:bg-sunken/40 hover:text-ink",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon size={14} />
                      <span className="mt-0.5 leading-none">{item.label}</span>
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
