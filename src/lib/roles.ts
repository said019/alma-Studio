import { useAuthStore } from "@/stores/authStore";

/* Quién ve dinero en el panel (spec §8). El servidor ya protege las rutas;
   esto sólo decide qué se muestra. */
export const OWNER_ROLES = ["admin", "super_admin"] as const;

export const canSeeFinance = (role?: string | null): boolean =>
  (OWNER_ROLES as readonly string[]).includes(String(role ?? ""));

export function useCanSeeFinance(): boolean {
  const role = useAuthStore((s) => (s.user as { role?: string } | null)?.role);
  return canSeeFinance(role);
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Dueña",
  super_admin: "Súper admin",
  reception: "Recepción",
  instructor: "Coach",
  coach: "Coach",
};

export const roleLabel = (role?: string | null): string => ROLE_LABEL[String(role ?? "")] ?? "Equipo";
