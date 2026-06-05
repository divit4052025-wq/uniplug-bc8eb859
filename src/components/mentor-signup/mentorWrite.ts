// P8 — write helpers for the authenticated mentor finalize step.
//   - upload the college-ID photo + per-admit proofs to the private
//     mentor-documents bucket (owner-prefix <uid>/...), storing the PATH;
//   - replay admits into mentor_admits (resolved → owner-RLS rows; unresolved →
//     file a university add-request, since ref_university_id is STRICT NOT NULL);
//   - submit_mentor_application() (requires id_document_path — enforced in the DB).
import { supabase } from "@/integrations/supabase/client";
import { createRefAddRequest } from "@/components/signup/refClient";
import type { RefItem } from "@/components/signup/types";

/** Upload a file to mentor-documents under the owner prefix; returns the path
 *  (the bucket is private, so we store the path, not a public URL). */
export async function uploadMentorDocument(
  userId: string,
  file: File,
  label: string,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safe = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const path = `${userId}/${safe}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("mentor-documents")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  return path;
}

/** Set the mentor's college-ID document path (mentor-writable). */
export async function setMentorIdDocument(userId: string, path: string): Promise<void> {
  const { error } = await supabase
    .from("mentors")
    .update({ id_document_path: path })
    .eq("id", userId);
  if (error) throw error;
}

export interface AdmitWrite {
  item: RefItem;
  proofPath: string | null;
}

/** Replay admits into mentor_admits. Resolved (id !== null) → upsert a row
 *  (updates proof_path on a re-run); unresolved → file a university add-request
 *  (the STRICT ref_university_id FK can't hold a name-only admit yet). */
export async function writeMentorAdmits(userId: string, admits: AdmitWrite[]): Promise<void> {
  const resolved = admits.filter((a) => a.item.id !== null);
  if (resolved.length > 0) {
    const { error } = await supabase.from("mentor_admits").upsert(
      resolved.map((a) => ({
        mentor_id: userId,
        ref_university_id: a.item.id as string,
        proof_path: a.proofPath,
      })),
      { onConflict: "mentor_id,ref_university_id" },
    );
    if (error) throw error;
  }
  for (const a of admits.filter((a) => a.item.id === null)) {
    await createRefAddRequest("university", a.item.name);
  }
}

/** Stamp the application submitted (DB requires id_document_path). */
export async function submitMentorApplication(): Promise<void> {
  const { error } = await supabase.rpc("submit_mentor_application");
  if (error) throw error;
}

/** Resubmit a rejected application (rejected → pending, clears the reason). */
export async function resubmitMentorApplication(): Promise<void> {
  const { error } = await supabase.rpc("resubmit_mentor_application");
  if (error) throw error;
}
