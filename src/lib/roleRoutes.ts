import type { User } from "@/types/auth";

export type UserRole = User["role"];

export function homePathForRole(role: UserRole | string | null | undefined) {
  if (role === "admin" || role === "super_admin") return "/admin/dashboard";
  if (role === "instructor") return "/staff/instructor";
  if (role === "reception") return "/staff/reception";
  if (role === "client") return "/app";
  return "/";
}
