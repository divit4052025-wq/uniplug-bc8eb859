import { createFileRoute } from "@tanstack/react-router";

import { QuarterPageShell } from "@/components/student-quarter/QuarterPageShell";
import { MyDocumentsSection } from "@/components/dashboard/sections/MyDocumentsSection";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// The Locker ← /dashboard/documents. Your essays, lists and materials —
// upload + remove via the real student-documents storage bucket + RLS.
export const Route = createFileRoute("/dashboard/locker")({
  component: LockerPage,
});

function LockerPage() {
  const { userId } = useStudentDashboard();
  return (
    <QuarterPageShell
      kind="Documents"
      title="The Locker"
      intro="Your essays, lists and materials — shared with the Plugs you work with."
    >
      <MyDocumentsSection userId={userId} />
    </QuarterPageShell>
  );
}
