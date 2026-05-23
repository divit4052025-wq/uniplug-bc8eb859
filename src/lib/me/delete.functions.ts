import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase G5 (2026-05-24): GDPR / DPDP account deletion.
 *
 * Cascading delete of the calling user. Relies on the FK ON DELETE
 * CASCADE chain from auth.users (students, mentors, etc.) so a single
 * supabaseAdmin.auth.admin.deleteUser() removes the bulk of the data.
 *
 * Storage cleanup is explicit (FK cascade doesn't reach storage.objects):
 * we list + delete every object under the user's prefix in both
 * mentor-documents and student-documents buckets before the auth delete.
 *
 * Idempotent-ish — deleting an already-deleted user is a 404 from
 * Supabase Auth; we treat it as success.
 */

const BUCKETS_PER_USER_PREFIX = ["mentor-documents", "student-documents"];

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm?: string } = {}) => input)
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // Belt-and-suspenders: client must opt-in with a confirm string
    // matching the user id. This prevents a clickjacked accidental
    // delete; UI presents the user with their email and asks them to
    // type their user id (or a fixed confirm string).
    if (data.confirm !== "DELETE-MY-ACCOUNT") {
      return {
        ok: false as const,
        reason: "confirm_required",
        hint: "Pass { confirm: 'DELETE-MY-ACCOUNT' }",
      };
    }

    let storageObjectsRemoved = 0;
    for (const bucket of BUCKETS_PER_USER_PREFIX) {
      try {
        const { data: list } = await supabaseAdmin.storage
          .from(bucket)
          .list(userId, { limit: 1000 });
        if (list && list.length > 0) {
          const paths = list.map((o) => `${userId}/${o.name}`);
          const { error: rmErr } = await supabaseAdmin.storage.from(bucket).remove(paths);
          if (rmErr) {
            console.warn(`[delete-account] failed to remove ${bucket} objects`, rmErr);
          } else {
            storageObjectsRemoved += paths.length;
          }
        }
      } catch (err) {
        console.warn(`[delete-account] storage list failed for ${bucket}`, err);
      }
    }

    // The FK chain from auth.users (ON DELETE CASCADE) handles
    // students, mentors, bookings (via FK), notifications, session_*,
    // referral_*, mentor_match_suggestions, mentor_training_completions,
    // ai_rate_limit_events, etc.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) {
      // 404 on already-deleted is fine.
      if (!`${delErr.message}`.toLowerCase().includes("not found")) {
        console.error("[delete-account] auth.admin.deleteUser failed", delErr);
        return {
          ok: false as const,
          reason: "auth_delete_failed",
          error: delErr.message,
        };
      }
    }

    return {
      ok: true as const,
      deleted_at: new Date().toISOString(),
      user_id: userId,
      storage_objects_removed: storageObjectsRemoved,
    };
  });
