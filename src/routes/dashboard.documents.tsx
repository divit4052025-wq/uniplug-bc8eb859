import { createFileRoute } from "@tanstack/react-router";

import { MySchoolsSection } from "@/components/dashboard/sections/MySchoolsSection";
import { MyDocumentsSection } from "@/components/dashboard/sections/MyDocumentsSection";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// My Documents (/dashboard/documents) — target schools + uploaded documents.
export const Route = createFileRoute("/dashboard/documents")({
  component: DashboardDocuments,
});

function DashboardDocuments() {
  const { userId } = useStudentDashboard();
  return (
    <div className="mt-8 space-y-12 animate-hero-rise">
      <MySchoolsSection userId={userId} />
      <MyDocumentsSection userId={userId} />
    </div>
  );
}
