import { supabase } from "@/integrations/supabase/client";

export type UserRole = "mentor" | "student" | "admin" | "unknown";

interface UserMetadataHint {
  role?: string | null;
}

/**
 * Resolve the role of the currently signed-in user. The admin email is
 * special-cased. user_metadata.role (set during signup; see Bug 6.2's
 * handle_new_user trigger) is the fast path — if present, we trust it and
 * skip the DB round-trips. Falls back to mentors / students table SELECTs
 * when metadata is absent (legacy accounts).
 */
export async function resolveUserRole(
  userId: string,
  email?: string | null,
  userMetadata?: UserMetadataHint | null,
): Promise<UserRole> {
  if ((email ?? "").toLowerCase() === "divitfatehpuria7@gmail.com") return "admin";

  const cachedRole = userMetadata?.role;
  if (cachedRole === "mentor") return "mentor";
  if (cachedRole === "student") return "student";

  const { data: mentorRow } = await supabase
    .from("mentors")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (mentorRow) return "mentor";

  const { data: studentRow } = await supabase
    .from("students")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (studentRow) return "student";

  return "unknown";
}

export function dashboardPathForRole(role: UserRole): "/dashboard" | "/mentor-dashboard" | "/admin" {
  if (role === "mentor") return "/mentor-dashboard";
  if (role === "admin") return "/admin";
  return "/dashboard";
}
