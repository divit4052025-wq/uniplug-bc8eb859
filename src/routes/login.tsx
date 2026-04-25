import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, Field, inputClass } from "@/components/site/AuthShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — UniPlug" },
      { name: "description", content: "Log in to your UniPlug account to access mentors, sessions and your dashboard." },
      { property: "og:title", content: "Log in — UniPlug" },
      { property: "og:description", content: "Log in to your UniPlug account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const userId = data.user?.id;
      if (!userId) throw new Error("Login failed.");

      // Determine role: check mentors first, then students.
      const { data: mentorRow } = await supabase
        .from("mentors").select("id").eq("id", userId).maybeSingle();
      if (mentorRow) {
        navigate({ to: "/mentor-dashboard" });
        return;
      }
      const { data: studentRow } = await supabase
        .from("students").select("id").eq("id", userId).maybeSingle();
      if (studentRow) {
        navigate({ to: "/dashboard" });
        return;
      }
      // Fallback by metadata
      const role = (data.user?.user_metadata?.role as string | undefined) ?? "student";
      navigate({ to: role === "mentor" ? "/mentor-dashboard" : "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in"
      subtitle="Pick up where you left off — your mentors, sessions and notes are waiting."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required className={inputClass} placeholder="you@school.com" />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} placeholder="••••••••" />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign In"}
        </button>

        <div className="space-y-1.5 pt-2 text-center text-[13px] text-[#1A1A1A]/70">
          <p>
            New student?{" "}
            <Link to="/student-signup" className="font-medium text-[#C4907F] hover:underline">Find Your Plug</Link>
          </p>
          <p>
            Want to become a Plug?{" "}
            <Link to="/mentor-signup" className="font-medium text-[#C4907F] hover:underline">Apply here</Link>
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
