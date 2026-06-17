import { createFileRoute } from "@tanstack/react-router";

import { MyDocumentsSection } from "@/components/dashboard/sections/MyDocumentsSection";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// My Documents (/dashboard/documents) — uploaded documents only. (Schools moved
// to the compact "My Schools" widget on the home page.)
export const Route = createFileRoute("/dashboard/documents")({
  component: DashboardDocuments,
});

function DashboardDocuments() {
  const { userId } = useStudentDashboard();
  return (
    <div className="mt-8 space-y-12 animate-hero-rise">
      <MyDocumentsSection userId={userId} />
    </div>
  );
}
