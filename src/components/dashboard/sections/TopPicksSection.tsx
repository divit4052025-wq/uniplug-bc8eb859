import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { generateMatchSuggestions } from "@/lib/ai/match.functions";
import { LoadingSkeleton, EmptyState } from "@/components/ui/state-views";
import { ErrorBanner } from "@/components/ui/error-banner";

/**
 * Phase D3 UI: "Top picks for you" — surfaces generateMatchSuggestions on
 * the student dashboard. Auto-loads on mount (one cached call per student
 * per IST day; a cache hit costs no AI call and no rate-limit budget). The
 * section is gated on profile completeness — grade + school + at least one
 * target country — which signup already enforces, so in practice it shows
 * for every signed-up student. A "Refresh" action forces regeneration.
 */

type MatchCard = {
  id: string;
  full_name: string;
  university: string;
  course: string;
  year: string;
  reason: string;
};

async function loadMatches(): Promise<MatchCard[]> {
  const result = await generateMatchSuggestions({ data: {} });
  if (!result.ok) {
    // No approved mentors to rank yet is an empty state, not an error.
    if (result.reason === "no_candidates") return [];
    // Everything else (ai_call_failed, rate_limit_exceeded, parse_failed,
    // student_only) surfaces as a calm, retryable error.
    throw new Error(result.reason);
  }
  // Enrich the {mentor_id, reason} pairs with display fields from the same
  // approved-profiles RPC the landing page and browse use.
  const { data: profiles, error } = await supabase.rpc("list_approved_mentor_profiles");
  if (error) throw error;
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return result.suggestions
    .map((s) => {
      const p = byId.get(s.mentor_id);
      if (!p) return null;
      return {
        id: p.id,
        full_name: p.full_name,
        university: p.university,
        course: p.course,
        year: p.year,
        reason: s.reason,
      };
    })
    .filter((c): c is MatchCard => c !== null);
}

export function TopPicksSection({ studentId }: { studentId: string }) {
  const qc = useQueryClient();

  // Profile-completeness gate. Definition: grade + school + >=1 country.
  const { data: complete } = useQuery<boolean>({
    queryKey: ["student-profile-complete", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("grade, school, countries")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return !!(data?.grade && data?.school && (data?.countries?.length ?? 0) > 0);
    },
  });

  const matchKey = ["match-suggestions", studentId] as const;

  const {
    data: matches = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<MatchCard[]>({
    queryKey: matchKey,
    enabled: complete === true,
    // AI generation is expensive; never auto-retry a failed generation.
    retry: false,
    queryFn: loadMatches,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const result = await generateMatchSuggestions({ data: { force: true } });
      if (!result.ok) throw new Error(result.reason);
    },
    onSuccess: () => {
      // The forced call upserted today's row; a plain refetch is a cache hit.
      void qc.invalidateQueries({ queryKey: matchKey });
      toast.success("Refreshed your top picks.");
    },
    onError: () => {
      toast.error("Couldn't refresh right now. Please try again later.");
    },
  });

  // Hidden entirely until the profile is complete (no flash of an empty box).
  if (complete !== true) return null;

  return (
    <section id="section-top-picks" className="scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[22px] font-semibold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          Top picks for you
        </h2>
        {matches.length > 0 && (
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[12px] font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <p className="mt-1 text-[13px] font-light text-muted-foreground">
        Mentors matched to your grade, school, and target countries.
      </p>

      <div className="mt-4">
        {isLoading ? (
          <LoadingSkeleton rows={3} ariaLabel="Finding your matches" />
        ) : isError ? (
          <ErrorBanner
            message="Couldn't generate your matches right now — try again later."
            onRetry={() => void refetch()}
          />
        ) : matches.length === 0 ? (
          <EmptyState
            title="No matches yet"
            description="We'll surface tailored mentor picks here as more mentors join. In the meantime, browse everyone available."
            cta={
              <Link
                to="/browse"
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition hover:opacity-90"
              >
                Browse mentors
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {matches.map((m, i) => (
              <li key={m.id}>
                <Link
                  to="/mentor/$id"
                  params={{ id: m.id }}
                  className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-card"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                  </div>
                  <p className="mt-3 text-[15px] font-medium text-foreground">{m.full_name}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {m.university} · {m.course} ({m.year})
                  </p>
                  <p className="mt-3 text-[13px] font-light text-foreground/80">{m.reason}</p>
                  <span className="mt-4 text-[12px] font-medium text-primary group-hover:underline">
                    View profile →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
