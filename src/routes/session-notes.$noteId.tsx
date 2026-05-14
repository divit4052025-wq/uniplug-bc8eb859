import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Circle, Pencil } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { resolveUserRole, dashboardPathForRole, type UserRole } from "@/lib/auth/role";
import { ErrorBanner } from "@/components/ui/error-banner";

export const Route = createFileRoute("/session-notes/$noteId")({
  head: () => ({
    meta: [{ title: "Session Note — UniPlug" }],
  }),
  component: MentorNoteView,
});

type Loaded = {
  id: string;
  mentor_id: string;
  student_id: string;
  student_name: string;
  date: string | null;
  time_slot: string | null;
  summary: string;
  action_points: string[];
  completions: Record<number, boolean>;
  updated_at: string;
  created_at: string;
};

function MentorNoteView() {
  const { noteId } = Route.useParams();
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<UserRole>("unknown");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessRes } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = sessRes.session;
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setCurrentUserId(session.user.id);
      const meta = (session.user.user_metadata ?? {}) as { role?: string };
      const r = await resolveUserRole(session.user.id, session.user.email, meta);
      if (cancelled) return;
      setRole(r);
      setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const { data: note, isLoading, isError, refetch } = useQuery<Loaded | null>({
    queryKey: ["session-note", noteId],
    enabled: authReady,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("session_notes")
        .select(
          "id, mentor_id, student_id, booking_id, summary, action_points, created_at, updated_at",
        )
        .eq("id", noteId)
        .maybeSingle();
      if (error) throw error;
      if (!row) return null;
      const [studsRes, bookingRes, compRes] = await Promise.all([
        supabase.rpc("get_student_booking_names", { _ids: [row.student_id] }),
        row.booking_id
          ? supabase
              .from("bookings")
              .select("date, time_slot")
              .eq("id", row.booking_id)
              .maybeSingle()
          : Promise.resolve({ data: null as { date: string; time_slot: string } | null, error: null }),
        supabase
          .from("action_point_completions")
          .select("action_point_index, completed")
          .eq("session_note_id", row.id),
      ]);
      if (studsRes.error) throw studsRes.error;
      if (bookingRes.error) throw bookingRes.error;
      if (compRes.error) throw compRes.error;
      const studentName =
        ((studsRes.data ?? []) as { id: string; full_name: string }[]).find(
          (s) => s.id === row.student_id,
        )?.full_name ?? "Student";
      const compMap: Record<number, boolean> = {};
      ((compRes.data ?? []) as { action_point_index: number; completed: boolean }[]).forEach(
        (c) => (compMap[c.action_point_index] = c.completed),
      );
      return {
        id: row.id,
        mentor_id: row.mentor_id,
        student_id: row.student_id,
        student_name: studentName,
        date: bookingRes.data?.date ?? null,
        time_slot: bookingRes.data?.time_slot ?? null,
        summary: row.summary ?? "",
        action_points: Array.isArray(row.action_points)
          ? (row.action_points as string[])
          : [],
        completions: compMap,
        updated_at: row.updated_at,
        created_at: row.created_at,
      };
    },
  });

  if (!authReady || isLoading) return <div className="min-h-screen bg-[#FFFCFB]" />;

  const backTo = dashboardPathForRole(role);

  if (isError) {
    return (
      <div className="min-h-screen bg-[#FFFCFB]">
        <div className="mx-auto max-w-[800px] px-5 pb-20 pt-12 sm:px-8">
          <button
            onClick={() => navigate({ to: backTo })}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1A1A1A]/70 hover:text-[#C4907F]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </button>
          <div className="mt-6">
            <ErrorBanner message="Couldn't load this note." onRetry={() => void refetch()} />
          </div>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen bg-[#FFFCFB]">
        <div className="mx-auto max-w-[800px] px-5 pb-20 pt-12 sm:px-8">
          <button
            onClick={() => navigate({ to: backTo })}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1A1A1A]/70 hover:text-[#C4907F]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </button>
          <p className="mt-8 text-[14px] text-[#1A1A1A]/70">
            This note is unavailable.
          </p>
        </div>
      </div>
    );
  }

  const wasEdited =
    new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 2000;
  const canEdit = role === "mentor" && currentUserId === note.mentor_id;

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <div className="mx-auto max-w-[800px] px-5 pb-20 pt-8 sm:px-8 md:pt-12">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate({ to: backTo })}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1A1A1A]/70 hover:text-[#C4907F]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </button>
          {canEdit && (
          <Link
            to="/mentor-dashboard"
            search={{ edit: note.id }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#C4907F] px-4 text-[13px] font-medium text-white hover:opacity-90"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit note
          </Link>
          )}
        </div>

        <div className="mt-8 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-wide text-[#1A1A1A]/50">
            {note.date ? new Date(note.date).toLocaleDateString() : "Session"}
            {note.time_slot ? ` · ${note.time_slot}` : ""}
          </p>
          <h1 className="mt-1 font-display text-[28px] font-semibold text-[#1A1A1A] md:text-[32px]">
            {note.student_name}
          </h1>

          <div className="mt-6">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
              Session summary
            </p>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#1A1A1A]">
              {note.summary || "—"}
            </p>
          </div>

          {note.action_points.length > 0 && (
            <div className="mt-7">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
                Action points
              </p>
              <ul className="mt-2 space-y-2">
                {note.action_points.map((ap, i) => {
                  const done = !!note.completions[i];
                  return (
                    <li key={i} className="flex items-start gap-2.5">
                      {done ? (
                        <span className="mt-0.5 grid h-5 w-5 place-content-center rounded-full bg-[#3F9D6E] text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 text-[#1A1A1A]/30" />
                      )}
                      <span
                        className={`text-[14px] ${
                          done ? "text-[#1A1A1A]/60 line-through" : "text-[#1A1A1A]"
                        }`}
                      >
                        {ap}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-7 flex items-center gap-2 border-t border-[#EDE0DB] pt-4">
            <p className="text-[11px] text-[#1A1A1A]/50">
              Last updated {new Date(note.updated_at).toLocaleString()}
            </p>
            {wasEdited && (
              <span className="rounded-full bg-[#C4907F]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#C4907F]">
                Updated
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
