import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase F2 admin tooling: issue short-lived signed URLs for a mentor's
 * private verification documents so an admin can review them before
 * approving.
 *
 * Access: the mentor-documents bucket has NO admin-side storage RLS policy
 * (per the F1 migration — the surface is kept narrow on purpose). Admin
 * reads happen here, server-side, after re-checking is_admin() against the
 * CALLER's JWT via context.supabase (the same allowlist gate the admin RPCs
 * use — not weakened, not reinvented). Only then does supabaseAdmin (service
 * role) sign the URLs. Read-only: no writes, no new storage policy.
 */

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — long enough to open, short enough to not linger.

export const getMentorVerificationDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mentorId: string }) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; idDocumentUrl: string | null; enrollmentLetterUrl: string | null }
      | { ok: false; reason: string }
    > => {
      // Gate on the caller's admin status (reuses is_admin() = email allowlist).
      const { data: isAdmin, error: adminErr } = await context.supabase.rpc("is_admin");
      if (adminErr || !isAdmin) {
        return { ok: false, reason: "forbidden" };
      }

      const { data: mentor, error: mErr } = await supabaseAdmin
        .from("mentors")
        .select("id_document_path, enrollment_letter_path")
        .eq("id", data.mentorId)
        .maybeSingle();
      if (mErr || !mentor) {
        return { ok: false, reason: "not_found" };
      }

      const sign = async (path: string | null): Promise<string | null> => {
        if (!path) return null;
        const { data: signed, error } = await supabaseAdmin.storage
          .from("mentor-documents")
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (error) {
          console.error("[mentor-verification] createSignedUrl failed", error);
          return null;
        }
        return signed?.signedUrl ?? null;
      };

      return {
        ok: true,
        idDocumentUrl: await sign(mentor.id_document_path),
        enrollmentLetterUrl: await sign(mentor.enrollment_letter_path),
      };
    },
  );
