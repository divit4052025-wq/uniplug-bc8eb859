import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell, Confirmation, Field, inputClass } from "@/components/site/AuthShell";
import { MultiSelect } from "@/components/site/MultiSelect";

export const Route = createFileRoute("/mentor-signup")({
  head: () => ({
    meta: [
      { title: "Become a Plug — Mentor with UniPlug" },
      {
        name: "description",
        content:
          "Apply to mentor Indian high school students on college admissions. Get paid for one-on-one sessions sharing your real journey.",
      },
      { property: "og:title", content: "Become a Plug — Mentor with UniPlug" },
      {
        property: "og:description",
        content:
          "Share your story. Open doors. Get paid for one-on-one mentorship sessions.",
      },
    ],
  }),
  component: MentorSignup,
});

const years = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year", "Postgraduate"];
const countries = ["United Kingdom", "United States", "India", "Singapore", "Canada", "Australia", "Germany", "Netherlands", "Hong Kong"];

const schema = z.object({
  fullName: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  university: z.string().trim().min(1, "Required").max(150),
  course: z.string().trim().min(1, "Required").max(150),
  year: z.string().min(1, "Required"),
  countries: z.array(z.string()).min(1, "Pick at least one"),
  password: z.string().min(8, "At least 8 characters").max(100),
});

function MentorSignup() {
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);

  if (done) {
    return (
      <Confirmation
        heading="Application received"
        body="Our team will review and get back to you within 48 hours."
      />
    );
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      fullName: String(fd.get("fullName") || ""),
      email: String(fd.get("email") || ""),
      university: String(fd.get("university") || ""),
      course: String(fd.get("course") || ""),
      year: String(fd.get("year") || ""),
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
    setDone(true);
  };

  return (
    <AuthShell
      eyebrow="For mentors"
      title="Become a Plug"
      subtitle="Be the senior you wish you'd had. Share your story, open doors, get paid for it."
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Full name">
          <input name="fullName" className={inputClass} placeholder="Rohan Iyer" />
          {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>}
        </Field>
        <Field label="University email address">
          <input name="email" type="email" className={inputClass} placeholder="you@university.edu" />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="University name">
            <input name="university" className={inputClass} placeholder="University of Oxford" />
            {errors.university && <p className="mt-1 text-xs text-destructive">{errors.university}</p>}
          </Field>
          <Field label="Course of study">
            <input name="course" className={inputClass} placeholder="Computer Science" />
            {errors.course && <p className="mt-1 text-xs text-destructive">{errors.course}</p>}
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Current year of study">
            <select name="year" className={inputClass} defaultValue="">
              <option value="" disabled>Select year</option>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
            {errors.year && <p className="mt-1 text-xs text-destructive">{errors.year}</p>}
          </Field>
          <Field label="Countries you can advise on">
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
          className="mt-2 w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:opacity-95"
        >
          Apply Now
        </button>
      </form>
    </AuthShell>
  );
}
