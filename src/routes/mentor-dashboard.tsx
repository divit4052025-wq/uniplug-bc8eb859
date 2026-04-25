import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mentor-dashboard")({
  head: () => ({
    meta: [{ title: "Application Received — UniPlug" }],
  }),
  component: MentorDashboard,
});

function MentorDashboard() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/mentor-signup" });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFFCFB] px-6">
      <div className="max-w-2xl text-center">
        <p className="font-display text-3xl text-[#1A1A1A] sm:text-4xl">
          Application received — we will review and get back to you within 48 hours.
        </p>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/" });
          }}
          className="mt-8 rounded-full border border-[#1A1A1A] px-6 py-2 text-sm font-medium text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white transition"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
