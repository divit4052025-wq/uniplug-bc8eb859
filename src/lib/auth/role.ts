import { supabase } from "@/integrations/supabase/client";

export type UserRole = "mentor" | "student" | "admin" | "unknown";

/**
 * Resolve the role of the currently signed-in user by checking the mentors
 * and students tables. The admin email is special-cased.
 */
export async function resolveUserRole(userId: string, email?: string | null): Promise<UserRole> {
  if ((email ?? "").toLowerCase() === "divitfatehpuria7@gmail.com") return "admin";
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