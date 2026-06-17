import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { MyPlugsSection } from "@/components/dashboard/sections/MyPlugsSection";
import { TopPicksSection } from "@/components/dashboard/sections/TopPicksSection";
import { MySchoolsWidget } from "@/components/dashboard/sections/MySchoolsWidget";
import { AwaitingConsentNotice } from "@/components/consent/AwaitingConsentNotice";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// Home — the dashboard index (/dashboard). Your plugs + recommendations, plus
// the profile-finalize nudge and awaiting-consent notice (shown only here, not
// across the other section pages — matching the pre-routing behaviour).
export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { userId, profileIncomplete, consent } = useStudentDashboard();
  const navigate = useNavigate();

  return (
    <div className="mt-8 space-y-12 animate-hero-rise">
      {profileIncomplete && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#C4907F]/30 bg-[#E8C4B8]/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#1A1A1A]">Finish setting up your profile</p>
            <p className="text-[13px] text-[#1A1A1A]/70">
              Add your subjects, targets and a photo for better mentor matches.
            </p>
          </div>
          {/* Near-black CTA: white-on-dusty-rose (#C4907F) fails WCAG AA
              contrast (~2.7:1); near-black clears it comfortably. */}
          <button
            type="button"
            onClick={() => navigate({ to: "/student-signup/finalize" })}
            className="shrink-0 rounded-full bg-[#1A1A1A] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
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
    </div>
  );
}
