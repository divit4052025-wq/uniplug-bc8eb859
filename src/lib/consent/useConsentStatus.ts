import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Mirrors the DB consent-required rule (requires_consent_base): under-18 by DOB
// (IST-agnostic on the client — a one-day edge is harmless; the DB gate is the
// real enforcement) OR a gated grade.
const GATED_GRADES = ["Grade 9", "Grade 10", "Grade 11"];

function isUnder18(dobISO: string | null): boolean {
  if (!dobISO) return false;
  const dob = new Date(`${dobISO}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age < 18;
}

export type ConsentStatus = {
  awaiting: boolean;
  parentEmail: string | null;
  // True only when consent was REQUIRED and a parental_consent record actually
  // exists — so the UI can say "consent on file" honestly, and NOT assert a
  // record for students who never required consent (18+ / non-gated grade).
  onFile: boolean;
};

/**
 * Whether a student is consent-required and still awaiting parental consent.
 * Purely a UX signal so a minor sees a calm explainer instead of the raw DB
 * P0001 — the booking gate (prevent_booking_minor_no_consent) is the real,
 * unbypassable enforcement.
 */
export function useConsentStatus(userId: string | null) {
  return useQuery<ConsentStatus>({
    queryKey: ["consent-status", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("date_of_birth, grade, parental_consent_at, parental_consent_email")
        .eq("id", userId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { awaiting: false, parentEmail: null, onFile: false };
      const required = isUnder18(data.date_of_birth) || GATED_GRADES.includes(data.grade ?? "");
      return {
        awaiting: required && !data.parental_consent_at,
        parentEmail: data.parental_consent_email,
        onFile: required && !!data.parental_consent_at,
      };
    },
  });
}
