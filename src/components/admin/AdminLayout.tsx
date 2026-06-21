import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard, Package, CreditCard, Users, CalendarDays,
  BookOpen, DollarSign,
  ShoppingCart, BarChart2, Bell, MessageCircle,
  Settings, ChevronLeft, ChevronRight, ChevronDown, LogOut, Globe, Menu, X,
} from "lucide-react";
import almaMark from "@/assets/alma/alma-mark.png";

const NAV_GROUPS = [
  {
    label: "",
    collapsible: false,
    items: [
      { path: "/admin/dashboard", label: "Inicio", icon: LayoutDashboard },
      { path: "/admin/bookings", label: "Reservas", icon: BookOpen },
      { path: "/admin/classes", label: "Clases", icon: CalendarDays },
      { path: "/admin/payments", label: "Cobros", icon: DollarSign },
      { path: "/admin/clients", label: "Personas", icon: Users },
    ],
  },
  {
    label: "Más",
    collapsible: true,
    items: [
      { path: "/admin/notifications", label: "Bandeja", icon: Bell },
      { path: "/admin/memberships", label: "Membresías", icon: CreditCard },
      { path: "/admin/plans", label: "Planes", icon: Package },
      { path: "/admin/pos", label: "Tienda", icon: ShoppingCart },
      { path: "/admin/reports", label: "Reportes", icon: BarChart2 },
    ],
  },
  {
    label: "Sistema",
    collapsible: false,
    items: [
      { path: "/admin/settings?tab=whatsapp", label: "WhatsApp", icon: MessageCircle },
      { path: "/admin/settings", label: "Configuración", icon: Settings },
    ],
  },
];

const MOBILE_QUICK_NAV = [
  { path: "/admin/dashboard", label: "Inicio", icon: LayoutDashboard },
  { path: "/admin/bookings", label: "Reservas", icon: BookOpen },
  { path: "/admin/classes", label: "Clases", icon: CalendarDays },
  { path: "/admin/clients", label: "Personas", icon: Users },
  { path: "/admin/payments", label: "Cobros", icon: DollarSign },
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

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const matchPath = (itemPath: string) => {
    const basePath = itemPath.split("?")[0];
    return location.pathname === basePath || location.pathname.startsWith(basePath + "/");
  };
  const currentItem = allItems.find((i) => matchPath(i.path));
  const activeGroup = NAV_GROUPS.find((g) => g.items.some((i) => matchPath(i.path)));

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
    <div className="alma-admin flex min-h-screen bg-alma-canvas text-alma-ink">
      {mobileOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-alma-ink/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 shrink-0",
          "border-r border-alma-hairline bg-alma-mist",
          "w-[88vw] max-w-[300px] -translate-x-full lg:translate-x-0 lg:static",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-[240px]",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-alma-hairline shrink-0",
            isCompact ? "justify-center px-3 py-5" : "justify-between px-5 py-5",
          )}
        >
          {!isCompact && (
            <img src={almaMark} alt="Alma Movement" className="h-12 w-auto object-contain" />
          )}

          <button
            onClick={() => setMobileOpen(false)}
            className="flex lg:hidden items-center justify-center w-8 h-8 rounded-lg text-alma-ink/55 hover:text-alma-ink hover:bg-alma-oat/40"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-colors",
              "text-alma-ink/45 hover:text-alma-ink hover:bg-alma-oat/40",
            )}
            aria-label="Contraer menú"
          >
            {collapsed ? <Menu size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {NAV_GROUPS.map((group) => {
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
                          isGroupActive ? "text-alma-ink/70" : "text-alma-ink/45",
                        )}
                      >
                        {group.label}
                      </span>
                      <ChevronDown
                        size={11}
                        className={cn(
                          "text-alma-ink/40 transition-transform duration-200",
                          isOpen ? "rotate-0" : "-rotate-90",
                        )}
                      />
                    </button>
                  ) : (
                    <p className="px-5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-ink/45">
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
                          ? "bg-alma-oat font-semibold text-alma-ink ring-1 ring-inset ring-alma-sandstone/50"
                          : "text-alma-ink/70 hover:text-alma-ink hover:bg-alma-oat/40",
                      )}
                    >
                      <span className="relative shrink-0 inline-flex">
                        <Icon size={15} />
                        {/* Badge: unread count para 'Bandeja' nav item */}
                        {path === "/admin/notifications" && unreadCount > 0 && (
                          <span className="nums absolute -top-2 -right-2.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-alma-ink-deep px-1 text-[0.7rem] font-semibold leading-none text-alma-canvas">
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

                {isCompact && <div className="mx-3 my-1 h-px bg-alma-hairline" />}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-alma-hairline pb-3 pt-2 shrink-0">
          <Link
            to="/"
            title={isCompact ? "Ver sitio" : undefined}
            className={cn(
              "flex items-center gap-3 mx-2 rounded-xl px-3 py-2 no-underline transition-colors",
              "text-alma-ink/60 hover:text-alma-ink hover:bg-alma-oat/40",
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
              "text-alma-ink/60 hover:text-destructive hover:bg-destructive/10",
              isCompact && "justify-center px-0",
            )}
          >
            <LogOut size={14} className="shrink-0" />
            {!isCompact && <span className="text-xs">Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <header className="shrink-0 h-14 flex items-center justify-between px-3 sm:px-4 lg:px-6 border-b border-alma-hairline bg-alma-canvas sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg text-alma-ink/60 hover:text-alma-ink hover:bg-alma-oat/40"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={16} />
            </button>
            <span className="text-alma-ink/50 text-[0.72rem] font-medium tracking-[0.12em] uppercase">Admin</span>
            {currentItem && (
              <>
                <ChevronRight size={12} className="text-alma-ink/35 shrink-0" />
                <span className="text-alma-ink text-xs sm:text-sm font-semibold truncate">{currentItem.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-alma-oat flex items-center justify-center text-[11px] font-semibold text-alma-ink">
              {user?.displayName?.[0]?.toUpperCase() ?? user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "A"}
            </div>
            {!isCompact && (
              <span className="text-xs text-alma-ink/70 hidden md:block truncate max-w-[180px]">
                {user?.displayName ?? user?.display_name ?? user?.email ?? "Admin"}
              </span>
            )}
          </div>
        </header>

        <main className="admin-mobile-main flex-1 overflow-auto pb-[88px] lg:pb-0 bg-alma-canvas">{children}</main>

        {isMobile && (
          <nav className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-alma-hairline bg-alma-canvas p-1 pb-safe shadow-sm lg:hidden">
            <ul className="grid grid-cols-5 gap-1">
              {MOBILE_QUICK_NAV.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      data-press
                      className={cn(
                        "flex h-12 min-h-[44px] flex-col items-center justify-center rounded-xl text-[11px] font-semibold transition-colors",
                        active
                          ? "bg-alma-oat text-alma-ink ring-1 ring-inset ring-alma-sandstone/50"
                          : "text-alma-ink/70 hover:bg-alma-oat/40 hover:text-alma-ink",
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
