import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell, Field, inputClass } from "@/components/site/AuthShell";
import { MultiSelect } from "@/components/site/MultiSelect";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student-signup")({
  head: () => ({
    meta: [
      { title: "Find Your Plug — UniPlug for Students" },
      {
        name: "description",
        content:
          "Sign up to get matched with verified university student mentors for one-on-one college admissions guidance.",
      },
      { property: "og:title", content: "Find Your Plug — UniPlug for Students" },
      {
        property: "og:description",
        content:
          "Real advice, real stories, real results — from students already living your dream.",
      },
    ],
  }),
  component: StudentSignup,
});

const grades = ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const countries = ["United Kingdom", "United States", "India", "Singapore", "Canada", "Australia", "Germany", "Netherlands", "Hong Kong"];

const schema = z.object({
  fullName: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().min(6, "Invalid phone").max(20),
  school: z.string().trim().min(1, "Required").max(150),
  grade: z.string().min(1, "Required"),
  countries: z.array(z.string()).min(1, "Pick at least one"),
  password: z.string().min(8, "At least 8 characters").max(100),
});

function StudentSignup() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      fullName: String(fd.get("fullName") || ""),
      email: String(fd.get("email") || ""),
      phone: String(fd.get("phone") || ""),
      school: String(fd.get("school") || ""),
      grade: String(fd.get("grade") || ""),
      countries: picked,
      password: String(fd.get("password") || ""),
    };
    const res = schema.safeParse(data);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            role: "student",
            full_name: data.fullName,
            phone: data.phone,
            school: data.school,
            grade: data.grade,
            countries: data.countries,
          },
        },
      });
      if (signUpError) throw signUpError;

      navigate({ to: "/dashboard" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      // Supabase wraps trigger-raised exceptions; show a friendly fallback in that case.
      const friendly = /database error saving new user/i.test(raw)
        ? "We couldn't create your account. Please check your details and try again."
        : raw;
      setServerError(friendly);
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="For students"
      title="Find Your Plug"
      subtitle="Tell us about you and we'll match you with university students who've walked the path you're starting."
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Full name">
          <input name="fullName" className={inputClass} placeholder="Aanya Sharma" />
          {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email address">
            <input name="email" type="email" className={inputClass} placeholder="you@school.edu" />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
          </Field>
          <Field label="Phone number">
            <input name="phone" className={inputClass} placeholder="+91 98765 43210" />
            {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
          </Field>
        </div>
        <Field label="School name">
          <input name="school" className={inputClass} placeholder="Delhi Public School" />
          {errors.school && <p className="mt-1 text-xs text-destructive">{errors.school}</p>}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Current grade">
            <select name="grade" className={inputClass} defaultValue="">
              <option value="" disabled>Select grade</option>
              {grades.map((g) => <option key={g}>{g}</option>)}
            </select>
            {errors.grade && <p className="mt-1 text-xs text-destructive">{errors.grade}</p>}
          </Field>
          <Field label="Target countries">
            <MultiSelect options={countries} value={picked} onChange={setPicked} placeholder="Pick countries" />
            {errors.countries && <p className="mt-1 text-xs text-destructive">{errors.countries}</p>}
          </Field>
        </div>
        <Field label="Password">
          <input name="password" type="password" className={inputClass} placeholder="At least 8 characters" />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
        </Field>
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Get Started"}
        </button>
        {serverError && (
          <p className="text-center text-xs text-destructive">{serverError}</p>
        )}
      </form>
    </AuthShell>
  );
}
