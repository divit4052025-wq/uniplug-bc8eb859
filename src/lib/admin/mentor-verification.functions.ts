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
      // Raw mentor ID documents are identity PII — SUPER-ADMIN only (per the
      // access model), gated on the server-side role system, not a blanket admin.
      const { data: isSuper, error: adminErr } = await context.supabase.rpc("is_super_admin");
      if (adminErr || !isSuper) {
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

      // Log the doc view BEFORE minting URLs (audit-before-read): who viewed whose
      // identity documents, when. Fail CLOSED — never hand over the docs unlogged.
      const { error: logErr } = await context.supabase.rpc("log_admin_action", {
        _action: "view_mentor_documents",
        _target_type: "mentor",
        _target_id: data.mentorId,
      });
      if (logErr) {
        return { ok: false, reason: "forbidden" };
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
