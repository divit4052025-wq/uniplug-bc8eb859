import { Star } from "lucide-react";

import { HqCard, HqEmpty, HqLoading, HqPageShell } from "@/components/mentor-hq/HqPageShell";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { ApprovalLockedCard } from "./shared";
import { useMentorRatingSummary } from "./data";

const ACCENT = "#C4907F"; // brown — the light-surface accent

export function LaurelsPage() {
  const { mentorId, status } = useMentorDashboard();

  if (status !== "approved") {
    return (
      <HqPageShell kind="Reputation" title="The Laurels">
        <ApprovalLockedCard landmark="The Laurels" />
      </HqPageShell>
    );
  }

  return <LaurelsContent mentorId={mentorId} />;
}

function LaurelsContent({ mentorId }: { mentorId: string }) {
  const { data, isLoading, isError } = useMentorRatingSummary(mentorId);

  const count = data?.review_count ?? 0;
  const avg = data?.avg_rating ?? null;
  const dist: { star: number; n: number }[] = [
    { star: 5, n: data?.star5 ?? 0 },
    { star: 4, n: data?.star4 ?? 0 },
    { star: 3, n: data?.star3 ?? 0 },
    { star: 2, n: data?.star2 ?? 0 },
    { star: 1, n: data?.star1 ?? 0 },
  ];

  return (
    <HqPageShell
      kind="Reputation"
      title="The Laurels"
      intro="How students have rated your sessions, in aggregate."
    >
      {isError ? (
        <HqCard>
          <p className="text-sm font-light text-[#1A1A1A]/60">
            Couldn't load your ratings right now. Please try again shortly.
          </p>
        </HqCard>
      ) : isLoading ? (
        <HqLoading rows={3} />
      ) : count === 0 ? (
        <HqEmpty mascot expression="guiding">
          No reviews yet. Once students rate your sessions, your average and star breakdown appear
          here.
        </HqEmpty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-stretch">
          {/* Big average */}
          <HqCard className="flex flex-col items-center justify-center text-center sm:min-w-[220px]">
            <p className="font-display text-5xl font-bold text-[#1A1A1A]">{avg ?? "—"}</p>
            <div className="mt-2 flex items-center gap-0.5" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className="h-4 w-4"
                  style={{
                    color: ACCENT,
                    fill: avg != null && i <= Math.round(avg) ? ACCENT : "transparent",
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-[13px] text-[#1A1A1A]/55">
              {count} review{count === 1 ? "" : "s"}
            </p>
          </HqCard>

          {/* Distribution (star5 → star1) */}
          <HqCard>
            <ul className="space-y-2.5" aria-label="Rating distribution">
              {dist.map(({ star, n }) => {
                const pct = count > 0 ? Math.round((n / count) * 100) : 0;
                return (
                  <li key={star} className="flex items-center gap-3">
                    <span className="flex w-10 shrink-0 items-center gap-1 text-[13px] font-semibold text-[#1A1A1A]">
                      {star}
                      <Star
                        className="h-3.5 w-3.5"
                        style={{ color: ACCENT, fill: ACCENT }}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#EDE0DB]">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${pct}%`, background: ACCENT }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right text-[12px] text-[#1A1A1A]/55">
                      {n}
                    </span>
                  </li>
                );
              })}
            </ul>
          </HqCard>
        </div>
      )}

      <p className="mt-6 text-[13px] font-light text-[#1A1A1A]/55">
        Students can see individual written reviews on your public profile — here you see the
        aggregate summary.
      </p>
    </HqPageShell>
  );
}
