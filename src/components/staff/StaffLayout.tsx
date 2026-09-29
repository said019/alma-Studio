import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, ExternalLink, LogOut, QrCode } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { homePathForRole } from "@/lib/roleRoutes";
import { BrandLogo } from "@/components/brand/BrandLogo";

interface StaffLayoutProps {
  children: ReactNode;
}

export function StaffLayout({ children }: StaffLayoutProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const roleLabel = user?.role === "reception" ? "Recepción" : "Instructora";
  const home = homePathForRole(user?.role);

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  return (
    <div className="min-h-[100dvh] bg-sunken text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to={home} className="flex items-center gap-3 no-underline">
            <span>
              <BrandLogo variant="lockup" className="h-[48px]" />
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-muted">
                Portal de {roleLabel}
              </span>
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1" aria-label="Navegación operativa">
            <Link
              to={home}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-muted no-underline hover:bg-line"
            >
              <CalendarDays size={16} />
              <span className="hidden sm:inline">Clases</span>
            </Link>
            {user?.role === "reception" && (
              <Link
                to="/staff/reception/checkin"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-muted no-underline hover:bg-line"
              >
                <QrCode size={16} />
                <span className="hidden sm:inline">Escáner</span>
              </Link>
            )}
            <Link
              to="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-ink-muted no-underline hover:bg-line"
              aria-label="Ver sitio público"
            >
              <ExternalLink size={16} />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-ink-muted hover:bg-line"
              aria-label="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
