/**
 * A2 — Mentor document byte-download endpoint. Server-only (createServerFn);
 * the service-role key never reaches the client.
 *
 * Mirrors getMentorVerificationDocs (src/lib/admin/mentor-verification.functions.ts):
 * a request-scoped, caller-JWT supabase client re-checks an access predicate
 * against the CALLER (never a client-supplied identity), and only then does the
 * service-role client (supabaseAdmin) mint a short-TTL signed URL. The student-
 * documents bucket is owner-uuid-prefix RLS, so a booked mentor cannot read the
 * bytes directly; the gate is can_mentor_access_document(_document_id) — a
 * zero-identity-arg SECURITY DEFINER predicate that derives the viewer from
 * auth.uid() and fails closed (parity with is_admin / authorize_video_join).
 *
 * Auth flow (same two-middleware idiom as getVideoCallAccess):
 *   attachSupabaseAuthHeader (client) attaches the caller's bearer token;
 *   requireSupabaseAuth (server) validates it → context.supabase runs with the
 *   real auth.uid(). An unauthenticated call 401s in the middleware.
 *
 * v1 scope: the BASE document object's storage_path (no version selection).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuthHeader } from "@/integrations/supabase/attach-auth-header";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — long enough to open, short enough to not linger.

const inputSchema = z.object({ documentId: z.string().uuid() });

export const getDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { documentId } = data;

    // 1. GATE on the CALLER's JWT (auth.uid()), never a client-supplied id. The
    //    predicate fails closed; a non-owner / non-booked mentor → false.
    const { data: allowed, error: gateErr } = await context.supabase.rpc(
      "can_mentor_access_document",
      { _document_id: documentId },
    );
    if (gateErr || !allowed) {
      throw new Error("forbidden");
    }

    // 2. Resolve the base document's storage_path with the service-role client
    //    (the gate above is the authority; this read only fetches the path).
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("student_documents")
      .select("storage_path")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr || !doc?.storage_path) {
      throw new Error("not_found");
    }

    // 3. Mint a short-lived signed URL for the private bucket.
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("student-documents")
      .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      throw new Error("sign_failed");
    }

    return { url: signed.signedUrl };
  });
