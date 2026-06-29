import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { QuarterPageShell } from "@/components/student-quarter/QuarterPageShell";
import { MyPlugsSection } from "@/components/dashboard/sections/MyPlugsSection";
import { TopPicksSection } from "@/components/dashboard/sections/TopPicksSection";
import { MySchoolsWidget } from "@/components/dashboard/sections/MySchoolsWidget";
import { AwaitingConsentNotice } from "@/components/consent/AwaitingConsentNotice";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// The Square ← /dashboard Home. My Plugs (booked mentors), Top picks for you
// (recommendations — honest loading/error/empty, never fabricated mentors), My
// Schools (Dream/Target/Safety list), and the finalize nudge. Real data via the
// existing section components, inside the locked Quarter chrome.
export const Route = createFileRoute("/dashboard/square")({
  component: SquarePage,
});

function SquarePage() {
  const { userId, firstName, profileIncomplete, consent } = useStudentDashboard();
  const navigate = useNavigate();

  return (
    <QuarterPageShell
      kind="Home"
      title="The Square"
      intro="Where you land. Your Plugs, your matches, your school list — and what’s next."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {profileIncomplete && (
          <div
            className="qc rose"
            style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontFamily: "var(--q-disp)", fontWeight: 700, fontSize: 15 }}>
                Finish setting up your profile
              </div>
              <div style={{ fontSize: 13, color: "var(--q-ink70)", marginTop: 2 }}>
                Add your subjects, targets and a photo for better mentor matches.
              </div>
            </div>
            <button
              type="button"
              className="qbtn qbtn-ink qbtn-sm"
              onClick={() => navigate({ to: "/student-signup/finalize" })}
            >
              Complete profile
            </button>
          </div>
        )}
        {consent?.awaiting && (
          <AwaitingConsentNotice studentId={userId} parentEmail={consent.parentEmail} />
        )}
        <MyPlugsSection studentId={userId} />
        <TopPicksSection studentId={userId} />
        <MySchoolsWidget userId={userId} />
        <p style={{ fontSize: 12.5, color: "var(--q-ink40)", fontWeight: 600 }}>
          Welcome back, {firstName || "friend"}.
        </p>
      </div>
    </QuarterPageShell>
  );
}
