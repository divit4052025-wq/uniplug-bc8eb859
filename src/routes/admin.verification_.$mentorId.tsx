import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  FileText,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Check,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMentorVerificationDocs } from "@/lib/admin/mentor-verification.functions";

/**
 * /admin/verification/$mentorId — mentor verification detail. Shows the
 * application fields + the SERVER-SIDE 18+ result, the prior rejection reason,
 * a super-admin-only + LOGGED document view (signed 5-min URLs), and the audited
 * approve / reject (= request-resubmit) actions. Approve is still gated by the
 * authoritative enforce_mentor_adult_on_approve 18+ trigger.
 */
export const Route = createFileRoute("/admin/verification_/$mentorId")({
  component: MentorDetail,
});

interface AppRow {
  id: string;
  full_name: string | null;
  email: string | null;
  university: string | null;
  course: string | null;
  year: string | null;
  college_email: string | null;
  status: string;
  tier: string;
  date_of_birth: string | null;
  is_adult: boolean;
  verified_at: string | null;
  verification_notes: string | null;
  application_submitted_at: string | null;
  has_id_doc: boolean;
  has_enrollment_doc: boolean;
}

interface Docs {
  ok: boolean;
  idDocumentUrl?: string | null;
  enrollmentLetterUrl?: string | null;
  reason?: string;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-[#1A1A1A]/40">{label}</div>
      <div className="text-[13px] text-[#1A1A1A]/85">{value ?? "—"}</div>
    </div>
  );
}

function MentorDetail() {
  const { mentorId } = useParams({ from: "/admin/verification_/$mentorId" });
  const qc = useQueryClient();
  const [docs, setDocs] = useState<Docs | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "mentor-app", mentorId] });
    qc.invalidateQueries({ queryKey: ["admin", "mentor-applications"] });
  };

  const { data: m, isLoading } = useQuery({
    queryKey: ["admin", "mentor-app", mentorId],
    queryFn: async (): Promise<AppRow | null> => {
      const { data, error } = await supabase.rpc("admin_list_mentor_applications", {
        _mentor_id: mentorId,
      });
      if (error) throw error;
      return ((data ?? [])[0] as AppRow) ?? null;
    },
  });

  const viewDocs = useMutation({
    mutationFn: async (): Promise<Docs> =>
      (await getMentorVerificationDocs({ data: { mentorId } })) as Docs,
    onSuccess: (d) => {
      if (!d.ok)
        toast.error(
          d.reason === "forbidden" ? "Documents are super-admin only" : "No documents on file",
        );
      else toast.success("Documents opened (logged)");
      setDocs(d);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_approve_mentor", { _mentor_id: mentorId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mentor approved (logged)");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(
        /18_plus|check_violation/.test(e.message)
          ? "Blocked: mentor is not verified 18+"
          : e.message,
      ),
  });

  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_reject_mentor", {
        _mentor_id: mentorId,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mentor rejected — sent back to resubmit (logged)");
      setRejecting(false);
      setReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return (
      <div className="py-10 text-center text-[#1A1A1A]/40">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
      </div>
    );
  if (!m)
    return <div className="py-10 text-center text-[13px] text-[#1A1A1A]/45">Mentor not found.</div>;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/admin/verification"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to applications
      </Link>

      <div className="rounded-lg border border-[#E3E5E9] bg-white p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-semibold">{m.full_name ?? "—"}</h2>
            <div className="text-[12px] text-[#1A1A1A]/50">{m.email}</div>
          </div>
          <div className="flex items-center gap-2">
            {m.tier === "enhanced" && (
              <span className="rounded bg-[#7b5ea7]/12 px-2 py-0.5 text-[11px] font-medium text-[#5b4585]">
                enhanced review
              </span>
            )}
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-semibold ${m.status === "approved" ? "bg-[#1f7a4d]/10 text-[#1f7a4d]" : m.status === "rejected" ? "bg-[#b4453b]/10 text-[#b4453b]" : "bg-[#c9a227]/15 text-[#8a6d00]"}`}
            >
              {m.status}
            </span>
          </div>
        </div>

        {/* 18+ result. The age MATH is authoritative (the DB trigger blocks any
            under-18 approval), but the DOB itself is SELF-DECLARED at signup — the
            admin must cross-check it against the ID document before approving (A2). */}
        <div
          className={`mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] ${m.is_adult ? "border-[#1f7a4d]/25 bg-[#1f7a4d]/[0.05] text-[#1f7a4d]" : "border-[#b4453b]/30 bg-[#b4453b]/[0.05] text-[#b4453b]"}`}
        >
          {m.is_adult ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          {m.is_adult
            ? "18+ by DOB on file (self-declared — confirm against the ID document before approving)"
            : "NOT 18+ by DOB on file — approval is blocked server-side until a valid adult DOB is on file"}
          {m.date_of_birth && (
            <span className="ml-auto font-mono text-[11px] opacity-70">DOB {m.date_of_birth}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="University" value={m.university} />
          <Field label="Course · Year" value={[m.course, m.year].filter(Boolean).join(" · ")} />
          <Field label="College email" value={m.college_email} />
          <Field
            label="Applied"
            value={
              m.application_submitted_at
                ? new Date(m.application_submitted_at).toLocaleString()
                : "not submitted"
            }
          />
        </div>

        {m.verification_notes && (
          <div className="mt-4 rounded-md border border-[#E3E5E9] bg-[#FAFBFC] p-3 text-[12.5px]">
            <div className="text-[10.5px] uppercase tracking-wide text-[#1A1A1A]/40">
              Last rejection reason
            </div>
            <div className="text-[#1A1A1A]/80">{m.verification_notes}</div>
          </div>
        )}

        {/* documents (super-admin only, logged) */}
        <div className="mt-4 border-t border-[#EDEFF2] pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
              Identity documents
            </span>
            <button
              onClick={() => viewDocs.mutate()}
              disabled={viewDocs.isPending}
              className="inline-flex items-center gap-1.5 rounded border border-[#D7DAE0] px-2.5 py-1 text-[12px] font-medium text-[#1A1A1A]/75 hover:bg-[#1A1A1A]/[0.04] disabled:opacity-50"
            >
              <FileText className="h-3.5 w-3.5" /> View documents (logged)
            </button>
          </div>
          {docs?.ok ? (
            <div className="flex flex-wrap gap-3 text-[12.5px]">
              {docs.idDocumentUrl ? (
                <a
                  href={docs.idDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#5b4585] underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> College ID
                </a>
              ) : (
                <span className="text-[#1A1A1A]/40">No college ID on file</span>
              )}
              {docs.enrollmentLetterUrl && (
                <a
                  href={docs.enrollmentLetterUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#5b4585] underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Enrollment letter
                </a>
              )}
              <span className="text-[11px] text-[#1A1A1A]/40">Links expire in ~5 min.</span>
            </div>
          ) : (
            <p className="text-[11.5px] text-[#1A1A1A]/45">
              {m.has_id_doc ? "College ID on file." : "No college ID uploaded yet."}
              {m.tier === "enhanced"
                ? m.has_enrollment_doc
                  ? " Enrollment proof on file."
                  : " Enrollment proof missing (enhanced review)."
                : ""}
            </p>
          )}
        </div>

        {/* decision */}
        <div className="mt-5 flex items-center gap-2 border-t border-[#EDEFF2] pt-4">
          <button
            onClick={() => approve.mutate()}
            disabled={approve.isPending || m.status === "approved"}
            className="inline-flex items-center gap-1.5 rounded bg-[#1f7a4d] px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Approve
          </button>
          <button
            onClick={() => setRejecting((v) => !v)}
            disabled={m.status === "rejected"}
            className="inline-flex items-center gap-1.5 rounded border border-[#b4453b]/30 px-3 py-1.5 text-[12.5px] font-medium text-[#b4453b] hover:bg-[#b4453b]/5 disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" /> Reject / request resubmit
          </button>
        </div>
        {rejecting && (
          <div className="mt-3">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason (emailed to the mentor; they can fix it and resubmit via HQ)"
              className="w-full rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
            />
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={() => reject.mutate()}
                disabled={reject.isPending || !reason.trim()}
                className="rounded bg-[#b4453b] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
              >
                Confirm reject
              </button>
              <button
                onClick={() => {
                  setRejecting(false);
                  setReason("");
                }}
                className="rounded border border-[#D7DAE0] px-2.5 py-1 text-[12px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
