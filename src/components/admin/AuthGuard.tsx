import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { SessionUnavailable } from "@/components/auth/SessionUnavailable";

const ADMIN_ROLES = ["admin", "super_admin", "reception", "instructor"];

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: string[];
}

export const AuthGuard = ({ children, requiredRoles = ADMIN_ROLES }: AuthGuardProps) => {
  const { user, isAuthenticated, sessionCheck, checkAuth } = useAuthStore();
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
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        Cargando...
      </div>
    );
  }

  // Un 429/5xx/red al verificar la sesión no es "no autorizada": no hay forma
  // de saber si la usuaria sigue con sesión válida, así que no se manda al
  // login (le borraría la sesión sin motivo) — se ofrece reintentar en vez de
  // eso (auditoría 2026-09-27, riesgo 3). Con usuaria guardada, se sigue como
  // hoy: se confía en la sesión local mientras el servidor no diga lo contrario.
  if (sessionCheck === "unavailable" && !user) {
    return <SessionUnavailable onRetry={() => { setChecked(false); checkAuth().then(() => setChecked(true)); }} />;
  }

  // Redirección declarativa con <Navigate>: idempotente, no apila history y
  // no dispara navigation throttling de Chrome aunque el componente re-renderice.
  if (!isAuthenticated || !user) {
    return <Navigate to={`/auth/login?returnUrl=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (!requiredRoles.includes(user.role)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
};
