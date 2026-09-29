import { AuthGuard } from "@/components/admin/AuthGuard";
import type { ReactNode } from "react";
export function StaffGuard({children, allowedRoles}: {children: ReactNode; allowedRoles: string[]}) {
  return <AuthGuard requiredRoles={allowedRoles}>{children}</AuthGuard>;
}
