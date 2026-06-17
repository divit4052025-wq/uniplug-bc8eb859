import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Circle, FileText, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";

// Mentor per-student page (/mentor-dashboard/students/$studentId). The `_`
// escape (students_) keeps this under the mentor-dashboard LAYOUT — inheriting
// the auth guard + mentorId context — but NOT under the roster, so it's a full
// page, not nested inside the list. The roster's "View Dashboard" links here.
//
// SECURITY: get_student_overview_for_mentor is SECURITY DEFINER and returns
// NOTHING unless the caller holds a confirmed/completed booking with this
// student (booking_relationship_is_active). A mentor who edits the URL to
// another mentor's student id gets an empty result → the clean not-found state
// below. No PII (name/grade/school/docs/schools) is ever rendered for a
// non-owned id, and the page never crashes.
export const Route = createFileRoute("/mentor-dashboard/students_/$studentId")({
  component: MentorStudentPage,
});

type DocItem = { id: string; file_name: string };
type SchoolItem = { id: string; name: string; category: string };
type NoteItem = {
  id: string;
  summary: string;
  created_at: string;
  action_points: string[];
  completions: Record<number, boolean>;
};
type StudentDetail = {
  found: boolean;
  name: string;
  grade: string;
  school: string;
  docs: DocItem[];
  schools: SchoolItem[];
  notes: NoteItem[];
  privateNote: { id: string; body: string } | null;
};

const EMPTY: StudentDetail = {
  found: false,
  name: "",
  grade: "",
  school: "",
  docs: [],
  schools: [],
  notes: [],
  privateNote: null,
};

function MentorStudentPage() {
  const { studentId } = Route.useParams();
  const { mentorId } = useMentorDashboard();
  const qc = useQueryClient();
  const detailKey = ["mentor-student-detail", mentorId, studentId] as const;

  const [noteDraft, setNoteDraft] = useState("");
  const [draftInit, setDraftInit] = useState(false);

  const {
    data = EMPTY,
    isLoading,
    isError,
    refetch,
  } = useQuery<StudentDetail>({
    queryKey: detailKey,
    queryFn: async () => {
      // The gated overview RPC drives BOTH the page content and the not-found
      // gate — empty result = not this mentor's student.
      const { data: overview, error: oErr } = await supabase.rpc(
        "get_student_overview_for_mentor",
        { _student_id: studentId },
      );
      if (oErr) throw oErr;
      const row = (
        overview as unknown as
          | {
              full_name?: string;
              grade?: string;
              school?: string;
              documents?: DocItem[];
              schools?: SchoolItem[];
            }[]
          | null
      )?.[0];
      if (!row) return EMPTY; // not found / not owned

      const [{ data: notes }, { data: priv }] = await Promise.all([
        supabase
          .from("session_notes")
          .select("id, summary, created_at, action_points")
          .eq("student_id", studentId)
          .eq("mentor_id", mentorId)
          .order("created_at", { ascending: false }),
        supabase
          .from("mentor_private_notes")
          .select("id, body")
          .eq("mentor_id", mentorId)
          .eq("student_id", studentId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const noteRows = notes ?? [];
      const compMap = new Map<string, Record<number, boolean>>();
      const noteIds = noteRows.map((n) => n.id);
      if (noteIds.length) {
        const { data: comps } = await supabase
          .from("action_point_completions")
          .select("session_note_id, action_point_index, completed")
          .in("session_note_id", noteIds);
        (comps ?? []).forEach((c) => {
          const cur = compMap.get(c.session_note_id) ?? {};
          cur[c.action_point_index] = c.completed;
          compMap.set(c.session_note_id, cur);
        });
      }

      return {
        found: true,
        name: row.full_name ?? "Student",
        grade: row.grade ?? "",
        school: row.school ?? "",
        docs: row.documents ?? [],
        schools: row.schools ?? [],
        notes: noteRows.map((n) => ({
          id: n.id,
          summary: n.summary ?? "",
          created_at: n.created_at,
          action_points: Array.isArray(n.action_points) ? (n.action_points as string[]) : [],
          completions: compMap.get(n.id) ?? {},
        })),
        privateNote: (priv as { id: string; body: string } | null) ?? null,
      };
    },
  });

  // Seed the private-note textarea once, from the loaded note.
  useEffect(() => {
    if (!draftInit && data.found) {
      setNoteDraft(data.privateNote?.body ?? "");
      setDraftInit(true);
    }
  }, [data, draftInit]);

  const saveNote = useMutation({
    mutationFn: async () => {
      const body = noteDraft.trim();
      const existingId = data.privateNote?.id ?? null;
      if (existingId) {
        if (!body) {
          const { error } = await supabase
            .from("mentor_private_notes")
            .delete()
            .eq("id", existingId);
          if (error) throw error;
          return;
        }
        const { error } = await supabase
          .from("mentor_private_notes")
          .update({ body, updated_at: new Date().toISOString() })
          .eq("id", existingId);
        if (error) throw error;
        return;
      }
      if (!body) return;
      const { error } = await supabase
        .from("mentor_private_notes")
        .insert({ mentor_id: mentorId, student_id: studentId, body });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Private note saved.");
      void qc.invalidateQueries({ queryKey: detailKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't save your note.");
    },
  });

  const backLink = (
    <Link
      to="/mentor-dashboard/students"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1A1A1A]/70 transition hover:text-[#C4907F]"
    >
      <ArrowLeft className="h-4 w-4" /> Back to My Students
    </Link>
  );

  return (
    <div className="mt-8 animate-hero-rise">
      {backLink}

      {isError ? (
        <div className="mt-6">
          <ErrorBanner message="Couldn't load this student." onRetry={() => void refetch()} />
        </div>
      ) : isLoading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#C4907F]" aria-label="Loading" />
        </div>
      ) : !data.found ? (
        <div className="mt-6 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-8 text-center">
          <h1 className="font-display text-[22px] font-semibold text-[#1A1A1A]">
            Student not found
          </h1>
          <p className="mt-2 text-[14px] font-light text-[#1A1A1A]/70">
            This student isn't on your roster, or you don't have a session with them yet.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <h1 className="font-display text-[28px] font-semibold text-[#1A1A1A]">{data.name}</h1>
            {(data.grade || data.school) && (
              <p className="mt-1 text-[13px] text-[#1A1A1A]/60">
                {[data.grade, data.school].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {/* School list */}
            <section className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">School List</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.schools.length === 0 ? (
                  <p className="text-[12px] text-[#1A1A1A]/50">None added.</p>
                ) : (
                  data.schools.map((s) => (
                    <span
                      key={s.id}
                      className="rounded-full bg-[#EDE0DB] px-3 py-1 text-[12px] text-[#1A1A1A]"
                    >
                      {s.name} <span className="opacity-50">· {s.category}</span>
                    </span>
                  ))
                )}
              </div>
            </section>

            {/* Documents */}
            <section className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Documents</h2>
              <ul className="mt-3 space-y-1.5">
                {data.docs.length === 0 ? (
                  <p className="text-[12px] text-[#1A1A1A]/50">No documents shared.</p>
                ) : (
                  data.docs.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-[13px] text-[#1A1A1A]">
                      <FileText className="h-4 w-4 text-[#C4907F]" />
                      {d.file_name}
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>

          {/* Previous session notes */}
          <section className="mt-5">
            <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Previous Session Notes</h2>
            <ul className="mt-3 space-y-3">
              {data.notes.length === 0 && (
                <p className="text-[12px] text-[#1A1A1A]/50">No notes yet.</p>
              )}
              {data.notes.map((n) => (
                <li key={n.id} className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[#1A1A1A]/50">
                    {new Date(n.created_at).toLocaleDateString()}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#1A1A1A]">
                    {n.summary || "—"}
                  </p>
                  {n.action_points.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {n.action_points.map((ap, i) => {
                        const done = !!n.completions[i];
                        return (
                          <li key={i} className="flex items-center gap-2 text-[12px]">
                            {done ? (
                              <span className="grid h-4 w-4 place-content-center rounded-full bg-[#3F9D6E] text-white">
                                <Check className="h-2.5 w-2.5" />
                              </span>
                            ) : (
                              <Circle className="h-4 w-4 text-[#1A1A1A]/30" />
                            )}
                            <span
                              className={done ? "text-[#1A1A1A]/60 line-through" : "text-[#1A1A1A]"}
                            >
                              {ap}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Private notes (mentor-only) */}
          <section className="mt-5 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[#1A1A1A]/50" />
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Private Notes</h2>
            </div>
            <p className="mt-0.5 text-[11px] text-[#1A1A1A]/50">
              Only you can see this — never shown to the student.
            </p>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={4}
              aria-label="Private notes about this student"
              placeholder="Jot private reminders about this student…"
              className="mt-2 w-full resize-none rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-3 py-2.5 text-[13px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => saveNote.mutate()}
                disabled={saveNote.isPending}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-[#1A1A1A] px-5 text-[12px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saveNote.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saveNote.isPending ? "Saving…" : "Save note"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
