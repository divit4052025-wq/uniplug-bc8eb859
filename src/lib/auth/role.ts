import { supabase } from "@/integrations/supabase/client";
import { withRetry } from "@/lib/retry";

export type UserRole = "mentor" | "student" | "admin" | "unknown";

interface UserMetadataHint {
  role?: string | null;
}

/**
 * Is the currently signed-in user an admin? Admin Console P0 (2026-07-01):
 * admin-ness is now data-driven — it comes from the server-side role system
 * (public.admin_roles, read via the current_admin_role() RPC), NOT a hardcoded
 * email. Returns true for ANY active admin role (super_admin or a future scoped
 * role). The RPC reads auth.uid() from the caller's session and only reveals the
 * caller's own role, so it is safe to call from the browser.
 */
export async function isAdminUser(): Promise<boolean> {
  const { data, error } = await withRetry(() => supabase.rpc("current_admin_role"));
  if (error) return false;
  return data != null;
}

/**
 * Resolve the role of the currently signed-in user. Admin is checked FIRST via
 * the role system (an admin's user_metadata.role is still "student"/"mentor", so
 * the metadata fast-path below cannot detect admins). user_metadata.role (set
 * during signup; see Bug 6.2's handle_new_user trigger) is the fast path for the
 * common student/mentor case — if present, we trust it and skip the DB
 * round-trips. Falls back to mentors / students SELECTs (each wrapped in
 * withRetry, Bug 6.7) when metadata is absent — primarily for legacy accounts.
 *
 * TRADEOFF: the admin check is now one current_admin_role() RPC on every
 * protected navigation (the old email compare was free). It's a single indexed
 * lookup and runs before the metadata fast-path because admins can't be
 * distinguished by metadata. If this hot-path round-trip ever matters, cache the
 * admin result per session (e.g. an app_metadata claim via an access-token hook)
 * rather than reordering — reordering would mis-classify the admin as a student.
 */
export async function resolveUserRole(
  userId: string,
  email?: string | null,
  userMetadata?: UserMetadataHint | null,
): Promise<UserRole> {
  if (await isAdminUser()) return "admin";

  const cachedRole = userMetadata?.role;
  if (cachedRole === "mentor") return "mentor";
  if (cachedRole === "student") return "student";

  const { data: mentorRow } = await withRetry(() =>
    supabase.from("mentors").select("id").eq("id", userId).maybeSingle(),
  );
  if (mentorRow) return "mentor";

  const { data: studentRow } = await withRetry(() =>
    supabase.from("students").select("id").eq("id", userId).maybeSingle(),
  );
  if (studentRow) return "student";

  return "unknown";
}

export function dashboardPathForRole(
  role: UserRole,
): "/dashboard" | "/mentor-dashboard" | "/admin" {
  if (role === "mentor") return "/mentor-dashboard";
  if (role === "admin") return "/admin";
  return "/dashboard";
}
