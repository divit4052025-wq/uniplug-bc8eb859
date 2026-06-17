import { createFileRoute } from "@tanstack/react-router";

import { ProfileSection } from "@/components/dashboard/sections/ProfileSection";
import { AccountDataSection } from "@/components/settings/AccountDataSection";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// Settings (/dashboard/settings) — profile editor + account/data management.
export const Route = createFileRoute("/dashboard/settings")({
  component: DashboardSettings,
});

function DashboardSettings() {
  const { userId } = useStudentDashboard();
  return (
    <div className="mt-8 animate-hero-rise">
      <h2 className="font-display text-[24px] font-semibold text-[#1A1A1A]">Settings</h2>
      <p className="mt-1 text-[13px] text-[#1A1A1A]/60">
        Edit your profile, and manage your data and account.
      </p>
      <div className="mt-8">
        <ProfileSection studentId={userId} />
      </div>
      <div className="mt-12 border-t border-[#EDE0DB] pt-10">
        <AccountDataSection />
      </div>
    </div>
  );
}
