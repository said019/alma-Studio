import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "@/types/auth";

interface ClientAuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: User["role"][];
}

export const ClientAuthGuard = ({ children, requiredRoles }: ClientAuthGuardProps) => {
  const { isAuthenticated, user, sessionCheck, checkAuth } = useAuthStore();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isAuthenticated) {
        await checkAuth();
      }
      setChecked(true);
    })();
  }, []);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Mismo patrón que AuthGuard (panel): un 429/5xx/red no cierra la sesión,
  // ofrece reintentar en vez de mandar al login (auditoría 2026-09-27, riesgo 3).
  if (sessionCheck === "unavailable" && !user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-foreground p-6 text-center">
        <p>No pudimos verificar tu sesión. El servidor está ocupado.</p>
        <button type="button" className="min-h-[44px] rounded-full border px-5 font-bold" onClick={() => { setChecked(false); checkAuth().then(() => setChecked(true)); }}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/auth/login?returnUrl=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    if (user.role === "admin" || user.role === "super_admin") return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to="/auth/login" replace />;
  }

  return <>{children}</>;
};
