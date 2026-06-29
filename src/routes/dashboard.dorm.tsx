import { createFileRoute } from "@tanstack/react-router";

import { QuarterPageShell } from "@/components/student-quarter/QuarterPageShell";
import { ProfileSection } from "@/components/dashboard/sections/ProfileSection";
import { AccountDataSection } from "@/components/settings/AccountDataSection";
import { AwaitingConsentNotice } from "@/components/consent/AwaitingConsentNotice";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// The Dorm ← /dashboard/settings. Profile + settings + parental-consent status.
// Consent is read-only here (status surfaced from the real consent gate); it is
// only ever granted via the parent token path — a student can never self-grant.
export const Route = createFileRoute("/dashboard/dorm")({
  component: DormPage,
});

function DormPage() {
  const { userId, consent } = useStudentDashboard();
  return (
    <QuarterPageShell
      kind="Profile & settings"
      title="The Dorm"
      intro="Your room — profile, targets, settings, and your parent’s consent."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {consent?.awaiting ? (
          <AwaitingConsentNotice studentId={userId} parentEmail={consent.parentEmail} />
        ) : (
          <div className="qc soft">
            <div className="q-verified" style={{ fontSize: 13 }}>
              Parental consent on file — booking is open.
            </div>
          </div>
        )}
        <ProfileSection studentId={userId} />
        <AccountDataSection />
      </div>
    </QuarterPageShell>
  );
}
