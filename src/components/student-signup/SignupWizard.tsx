// Student-signup v2 — the cinematic, act-based pre-account wizard (Acts 1–4,
// anonymous, at /student-signup). Visually a single narrative (arrival → form
// acts with kinetic interstitials → "Account created." → "Check your inbox"),
// but the DATA CONTRACT is identical to v1: scalars ride in the auth.signUp
// metadata that handle_new_user reads; the rich join-table selections are
// stashed on-device and replayed in the authenticated finalize step (Act 5,
// /student-signup/finalize). The ONLY new metadata key is code_of_conduct_version.
//
// Child-safety: minor gating follows the server rule consentRequired(dob, grade)
// = under-18 OR grade 9/10/11 — NOT DOB alone — so parent contact is collected
// for the gated-but-18 case (in the consent step) and the consent token mints.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";

import { Mascot, type MascotExpression } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";
import { log, looksLikeEmailSendFailure } from "@/lib/log";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { ProjectsField } from "./fields/ProjectsField";
import { SchoolTypeahead } from "./fields/SchoolTypeahead";
import { saveProfileDraft } from "./draft";
import {
  BOARDS,
  CODE_OF_CONDUCT_VERSION,
  consentRequired,
  COUNTRIES,
  isUnder18,
  LEGAL_VERSION,
} from "./constants";
import type { ProjectDraft, RefItem, UniPick } from "./types";
import { SignupCursor } from "./v2/SignupCursor";
import { FounderCompanion } from "./v2/FounderCompanion";
import { ActInterstitial, type InterstitialWord } from "./v2/ActInterstitial";
import { ArrivalBeat, AccountCreatedBeat } from "./v2/beats";
import { UniversityTierField } from "./v2/UniversityTierField";

type View =
  | "arrival"
  | "basics"
  | "school"
  | "grade"
  | "universities"
  | "study"
  | "sports"
  | "beyond"
  | "about"
  | "consent"
  | "account"
  | "verify";

const META: Record<string, { kicker: string; title: string; expr: MascotExpression }> = {
  basics: { kicker: "First things first", title: "Let’s get you on the map.", expr: "happy" },
  school: { kicker: "Where you study", title: "Which school are you at?", expr: "thinking" },
  grade: { kicker: "Your year", title: "Which stretch are you in?", expr: "guiding" },
  universities: { kicker: "The dream", title: "Where are you aiming?", expr: "excited" },
  study: { kicker: "Your subjects", title: "What do you want to study?", expr: "thinking" },
  sports: { kicker: "On the field", title: "Anything you play?", expr: "excited" },
  beyond: { kicker: "Beyond the classroom", title: "What else lights you up?", expr: "happy" },
  about: { kicker: "In your words", title: "Tell us who you are.", expr: "happy" },
  consent: { kicker: "One quick thing", title: "We loop in your guardian.", expr: "guiding" },
  account: { kicker: "Last step", title: "Lock it in.", expr: "focused" },
  verify: { kicker: "One click to go", title: "Check your inbox.", expr: "happy" },
};

const ACT: Record<string, number> = {
  basics: 2,
  school: 2,
  grade: 2,
  universities: 3,
  study: 3,
  sports: 3,
  beyond: 3,
  about: 3,
  consent: 4,
  account: 4,
};

const PAPER = "var(--brand-paper)";
const ROSE = "var(--brand-rose)";
const ACCENT = "var(--primary)"; // the interstitial dash accent (= rose-deep, NOT ink)
const INTER: Record<number, InterstitialWord[]> = {
  3: [
    { text: "Now", color: PAPER },
    { text: "—", color: ACCENT },
    { text: "let’s", color: PAPER },
    { text: "talk", color: PAPER },
    { text: "about", color: PAPER },
    { text: "your", color: PAPER },
    { text: "dreams.", color: ROSE },
  ],
  4: [
    { text: "Let’s", color: PAPER },
    { text: "make", color: PAPER },
    { text: "it", color: PAPER },
    { text: "official.", color: ROSE },
  ],
};

const GRADE_CARDS: {
  value: string;
  label: string;
  shape: "sprout" | "climber" | "spark";
  stage: string;
  expr: MascotExpression;
}[] = [
  { value: "Grade 9", label: "9", shape: "sprout", stage: "Sprout", expr: "happy" },
  { value: "Grade 10", label: "10", shape: "sprout", stage: "Sprout", expr: "happy" },
  { value: "Grade 11", label: "11", shape: "climber", stage: "Climber", expr: "thinking" },
  { value: "Grade 12", label: "12", shape: "spark", stage: "Spark", expr: "focused" },
];
const GRADE_BLURB: Record<string, string> = {
  "Grade 9": "Grade 9 — plenty of runway. Let’s explore.",
  "Grade 10": "Grade 10 — finding your shape. Good time to start.",
  "Grade 11": "Grade 11 — the build year. Let’s get sharp.",
  "Grade 12": "Grade 12 — final stretch. Every move counts.",
};

const SKIPPABLE = new Set(["universities", "study", "sports", "beyond", "about"]);

const inputCls =
  "w-full rounded-md border border-border bg-background px-4 py-3.5 text-[16px] font-medium text-foreground outline-none transition placeholder:text-brand-ink-faint focus:border-primary";
const labelCls = "mb-1.5 block text-[13px] font-semibold text-brand-ink-soft";
const errCls = "mt-1.5 block text-[12px] font-semibold text-destructive";

function pwStrength(p: string): number {
  let n = 0;
  if (p.length >= 8) n += 1;
  if (/[A-Z]/.test(p)) n += 1;
  if (/[0-9]/.test(p)) n += 1;
  if (/[^A-Za-z0-9]/.test(p)) n += 1;
  return n;
}

export function SignupWizard() {
  const navigate = useNavigate();

  // Scalars → auth.signUp metadata.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");
  const [board, setBoard] = useState("");
  const [bio, setBio] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [countries, setCountries] = useState<string[]>([]);

  // Rich selections → stashed, replayed at finalize.
  const [subjects, setSubjects] = useState<RefItem[]>([]);
  const [targetUniversities, setTargetUniversities] = useState<UniPick[]>([]);
  const [courses, setCourses] = useState<RefItem[]>([]);
  const [sports, setSports] = useState<RefItem[]>([]);
  const [cocurriculars, setCocurriculars] = useState<RefItem[]>([]);
  const [projects, setProjects] = useState<ProjectDraft[]>([]);

  // Account.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);

  // Flow.
  const [view, setView] = useState<View>("arrival");
  const [trans, setTrans] = useState<{ target: View; words: InterstitialWord[] } | null>(null);
  const [micro, setMicro] = useState(false);
  const [founderExpr, setFounderExpr] = useState<MascotExpression>("happy");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const transTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const microTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Move focus to the scene heading on every act/scene change so AT + keyboard
  // users (whose "Continue" button just unmounted) land in the new step. On the
  // arrival beat the heading isn't mounted → no-op.
  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);

  const minor = consentRequired(dob, grade);
  const under18 = isUnder18(dob);
  const firstName = fullName.trim().split(" ")[0] || "";

  const contentScenes = useMemo(() => {
    const s: View[] = [
      "basics",
      "school",
      "grade",
      "universities",
      "study",
      "sports",
      "beyond",
      "about",
    ];
    if (minor) s.push("consent");
    s.push("account");
    return s;
  }, [minor]);

  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  function validate(key: View): Record<string, string> {
    const e: Record<string, string> = {};
    if (key === "basics") {
      if (!fullName.trim()) e.fullName = "Required";
      if (!isEmail(email)) e.email = "Enter a valid email";
      if (phone.trim().length < 6) e.phone = "Enter a valid phone number";
      const d = new Date(`${dob}T00:00:00`);
      if (!dob || Number.isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900)
        e.dob = "Enter a valid date of birth";
      if (under18) {
        if (!isEmail(parentEmail)) e.parentEmail = "Parent’s email is required";
        else if (parentEmail.trim().toLowerCase() === email.trim().toLowerCase())
          e.parentEmail = "Use a parent or guardian’s email — not your own";
        if (parentPhone.trim().length < 6) e.parentPhone = "Parent’s phone is required";
        else if (parentPhone.replace(/\D/g, "") === phone.replace(/\D/g, ""))
          e.parentPhone = "Use a parent or guardian’s phone — not your own";
      }
    } else if (key === "school") {
      if (!school.trim()) e.school = "Required";
    } else if (key === "grade") {
      if (!grade) e.grade = "Pick your grade";
    } else if (key === "consent") {
      // gated-grade-but-18+: parent contact not collected in basics, so collect here.
      if (!under18) {
        if (!isEmail(parentEmail)) e.parentEmail = "Parent’s email is required";
        else if (parentEmail.trim().toLowerCase() === email.trim().toLowerCase())
          e.parentEmail = "Use a parent or guardian’s email — not your own";
        if (parentPhone.trim().length < 6) e.parentPhone = "Parent’s phone is required";
        else if (parentPhone.replace(/\D/g, "") === phone.replace(/\D/g, ""))
          e.parentPhone = "Use a parent or guardian’s phone — not your own";
      }
    } else if (key === "account") {
      if (password.length < 8) e.password = "At least 8 characters";
      if (confirm !== password) e.confirm = "Passwords don’t match";
      if (!agreed) e.agreed = "Please accept the agreements to continue";
    }
    return e;
  }

  const goTo = (key: View) => {
    setErrors({});
    setView(key);
    setFounderExpr(META[key]?.expr ?? "happy");
  };

  const begin = () => goTo("basics");

  const playTrans = (target: View) => {
    const act = ACT[target];
    setTrans({ target, words: INTER[act] ?? [{ text: "Next.", color: PAPER }] });
    if (transTimer.current) clearTimeout(transTimer.current);
    transTimer.current = setTimeout(() => commitTrans(target), 1400);
  };
  const commitTrans = (target?: View) => {
    if (transTimer.current) clearTimeout(transTimer.current);
    const t = target ?? trans?.target;
    if (!t) return;
    setTrans(null);
    goTo(t);
  };

  const idxIn = (k: View) => contentScenes.indexOf(k);
  const canBack = contentScenes.includes(view) && idxIn(view) > 0;
  const onBack = () => {
    const i = idxIn(view);
    if (i > 0) goTo(contentScenes[i - 1]);
  };

  const onNext = () => {
    if (!contentScenes.includes(view)) return;
    const e = validate(view);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      setFounderExpr("confused");
      return;
    }
    if (view === "account") {
      void submit();
      return;
    }
    const next = contentScenes[idxIn(view) + 1];
    if (!next) return;
    if (ACT[next] > ACT[view]) playTrans(next);
    else goTo(next);
  };

  async function submit() {
    setServerError(null);
    setSubmitting(true);
    // Stash the rich selections (incl. uni tiers) for the authenticated replay.
    saveProfileDraft({ subjects, targetUniversities, courses, sports, cocurriculars, projects });
    const needsConsent = consentRequired(dob, grade);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/student-signup/finalize?welcome=1`,
          data: {
            role: "student",
            full_name: fullName.trim(),
            phone: phone.trim(),
            school: school.trim(),
            grade,
            countries,
            date_of_birth: dob,
            parent_email: needsConsent ? parentEmail.trim() : "",
            parent_phone: needsConsent ? parentPhone.trim() : "",
            board: board || "",
            bio: bio.trim(),
            terms_version: LEGAL_VERSION,
            privacy_version: LEGAL_VERSION,
            code_of_conduct_version: CODE_OF_CONDUCT_VERSION,
          },
        },
      });
      if (error) throw error;
      // Celebrate (micro-bloom), then route by confirmation state.
      setMicro(true);
      setFounderExpr("celebrating");
      if (microTimer.current) clearTimeout(microTimer.current);
      microTimer.current = setTimeout(() => {
        setMicro(false);
        if (data.session) {
          // Auto-confirmed (e.g. local dev) → finalize (Act 5). Hard nav so the
          // ?welcome=1 lands the one-time "You're almost home." beat.
          window.location.assign(`${window.location.origin}/student-signup/finalize?welcome=1`);
        } else {
          setPendingEmail(email.trim());
          setView("verify");
          setFounderExpr("happy");
          setSubmitting(false);
        }
      }, 1500);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      log.error({
        surface: "web",
        event: "auth_signup_failed",
        alert: looksLikeEmailSendFailure(raw),
        kind: "student_signup",
        error: raw,
      });
      setServerError(
        /database error saving new user/i.test(raw)
          ? "We couldn’t create your account. Please check your details and try again."
          : raw,
      );
      setMicro(false);
      setSubmitting(false);
    }
  }

  const onResend = async () => {
    if (!pendingEmail || resendState !== "idle") return;
    setResendState("sending");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/student-signup/finalize?welcome=1` },
    });
    if (error) {
      log.error({
        surface: "web",
        event: "auth_email_send_failed",
        alert: looksLikeEmailSendFailure(error.message),
        kind: "signup_confirmation_resend",
        error: error.message,
      });
      setResendState("idle");
      return;
    }
    setResendState("sent");
  };

  // Founder reacts to focus/blur within the form.
  const onFocusCapture = () => {
    if (founderExpr !== "thinking") setFounderExpr("thinking");
  };
  const onBlurCapture = () => setFounderExpr(META[view]?.expr ?? "happy");

  const personalTitle = (() => {
    const m = META[view];
    if (!m) return "";
    if (view === "school" && firstName) return `Where do you study, ${firstName}?`;
    if (view === "universities" && firstName) return `Aim high, ${firstName}.`;
    if (view === "verify") return `Check your inbox${firstName ? `, ${firstName}` : ""}.`;
    return m.title;
  })();

  const inFlow = view !== "arrival";
  const showNav = contentScenes.includes(view);
  const pw = pwStrength(password);
  const pwW = ["8%", "30%", "55%", "80%", "100%"][pw];
  const pwColor = ["#D2CECB", "#ED7E4A", "#F2D098", "#C5D9B0", "#95B07E"][pw];
  const pwLabel = ["Too short", "Weak", "Okay", "Good", "Strong"][pw];

  return (
    <div className="signup-wizard relative h-dvh overflow-hidden overscroll-none bg-brand-paper text-foreground">
      <SignupCursor />

      {/* persistent wordmark on light form scenes (dark beats sit above with their own).
          Wrapped in a positioned div so the Logo's own `relative` wrapper can't win
          over the intended absolute placement. */}
      <div className="absolute left-10 top-8 z-[5]">
        {/* `-offwhite` = the ink glyph FOR off-white/light backgrounds (suffix is
            the target bg, not the glyph colour). */}
        <Logo variant="wordmark-offwhite" size={34} />
      </div>

      {/* ── Light form layer (Acts 2–4 + verify) ── */}
      {inFlow && (
        <div className="absolute inset-0 flex items-center justify-center px-8 py-16 sm:px-16">
          <div className="flex max-h-full w-full max-w-[920px] items-center gap-10 lg:gap-14">
            {/* persistent reactive Founder — flex-none + self-center so it stays put
                while the content column scrolls internally */}
            <FounderCompanion
              expression={founderExpr}
              size={168}
              className="hidden shrink-0 self-center md:block"
            />

            <div
              className="hide-scrollbar max-h-full w-full max-w-[600px] flex-1 overflow-y-auto"
              onFocusCapture={onFocusCapture}
              onBlurCapture={onBlurCapture}
            >
              {/* off-screen live region — announce the first validation error to AT */}
              <p aria-live="assertive" className="sr-only">
                {Object.values(errors).filter(Boolean)[0] ?? ""}
              </p>
              {/* AT progress cue — announces position as scenes change */}
              <p aria-live="polite" className="sr-only">
                {showNav ? `Step ${idxIn(view) + 1} of ${contentScenes.length}` : ""}
              </p>
              {/* scene head */}
              <div className="mb-7">
                <div className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-ink-faint">
                  {META[view]?.kicker}
                </div>
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="m-0 text-balance font-display text-[clamp(30px,4.5vw,42px)] font-extrabold leading-tight tracking-[-0.022em] outline-none"
                >
                  {personalTitle}
                </h1>
              </div>

              {/* ── BASICS ── */}
              {view === "basics" && (
                <div className="flex flex-col gap-4">
                  <label className="block">
                    <span className={labelCls}>Full name</span>
                    <input
                      className={inputCls}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Aanya Sharma"
                    />
                    {errors.fullName && <span className={errCls}>{errors.fullName}</span>}
                  </label>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelCls}>Email</span>
                      <input
                        className={inputCls}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@email.com"
                      />
                      {errors.email && <span className={errCls}>{errors.email}</span>}
                    </label>
                    <label className="block">
                      <span className={labelCls}>Phone</span>
                      <input
                        className={inputCls}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                      />
                      {errors.phone && <span className={errCls}>{errors.phone}</span>}
                    </label>
                  </div>
                  <label className="block">
                    <span className={labelCls}>Date of birth</span>
                    <input
                      className={`${inputCls} max-w-[240px]`}
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                    />
                    <span className="mt-1.5 block text-[12px] text-brand-ink-faint">
                      Only used to check whether a parent needs to approve.
                    </span>
                    {errors.dob && <span className={errCls}>{errors.dob}</span>}
                  </label>
                  {under18 && (
                    <div className="rounded-md border border-dashed border-primary bg-primary/[0.07] p-[18px]">
                      <div className="mb-1 flex items-center gap-2.5">
                        <Mascot
                          shape="mentor"
                          color={MASCOTS.mentor.color}
                          expression="guiding"
                          size={34}
                          decorative
                        />
                        <span className="font-display text-[16px] font-extrabold">
                          A grown-up comes along
                        </span>
                      </div>
                      <p className="mb-3.5 ml-11 text-[13px] leading-relaxed text-brand-ink-soft">
                        You’re under 18, so we’ll email your parent or guardian for consent. Add
                        their details.
                      </p>
                      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        <label className="block">
                          <span className={labelCls}>Parent’s email</span>
                          <input
                            className={inputCls}
                            type="email"
                            value={parentEmail}
                            onChange={(e) => setParentEmail(e.target.value)}
                            placeholder="parent@email.com"
                          />
                          {errors.parentEmail && (
                            <span className={errCls}>{errors.parentEmail}</span>
                          )}
                        </label>
                        <label className="block">
                          <span className={labelCls}>Parent’s phone</span>
                          <input
                            className={inputCls}
                            value={parentPhone}
                            onChange={(e) => setParentPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                          />
                          {errors.parentPhone && (
                            <span className={errCls}>{errors.parentPhone}</span>
                          )}
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── SCHOOL ── */}
              {view === "school" && (
                <div className="flex flex-col gap-[18px]">
                  <label className="block">
                    <span className={labelCls}>School name</span>
                    <SchoolTypeahead
                      value={school}
                      onChange={setSchool}
                      ariaLabel="School name"
                      placeholder="Start typing your school…"
                    />
                    {errors.school && <span className={errCls}>{errors.school}</span>}
                  </label>
                  <div>
                    <span className={labelCls}>Examination board</span>
                    <div
                      className="flex flex-wrap gap-2.5"
                      role="group"
                      aria-label="Examination board"
                    >
                      {BOARDS.map((b) => {
                        const active = board === b;
                        return (
                          <button
                            key={b}
                            type="button"
                            data-mag
                            data-hov
                            aria-pressed={active}
                            onClick={() => setBoard(active ? "" : b)}
                            className={`cursor-none rounded-md border px-[18px] py-2.5 text-[14px] font-semibold transition ${
                              active
                                ? "border-foreground bg-foreground text-brand-paper"
                                : "border-border bg-background text-foreground"
                            }`}
                          >
                            {b}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── GRADE ── */}
              {view === "grade" && (
                <div>
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                    {GRADE_CARDS.map((g) => {
                      const active = grade === g.value;
                      return (
                        <button
                          key={g.value}
                          type="button"
                          data-mag
                          data-hov
                          aria-pressed={active}
                          onClick={() => {
                            setGrade(g.value);
                            setErrors({});
                            setFounderExpr("celebrating");
                          }}
                          className={`cursor-none rounded-md border px-2.5 pb-3.5 pt-[18px] text-center transition ${
                            active
                              ? "-translate-y-1 border-brand-rose bg-brand-rose/[0.16]"
                              : "border-border bg-background"
                          }`}
                        >
                          <div className="mx-auto flex h-[82px] w-[72px] items-end justify-center">
                            <Mascot
                              shape={g.shape}
                              color={MASCOTS[g.shape].color}
                              expression={g.expr}
                              size={72}
                              decorative
                            />
                          </div>
                          <div className="mt-1.5 font-display text-[30px] font-extrabold leading-none">
                            {g.label}
                          </div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-ink-faint">
                            {g.stage}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {grade && (
                    <p className="mt-6 text-center font-display text-[22px] font-extrabold tracking-[-0.01em]">
                      {GRADE_BLURB[grade]}
                    </p>
                  )}
                  {errors.grade && <span className={`${errCls} text-center`}>{errors.grade}</span>}
                </div>
              )}

              {/* ── UNIVERSITIES ── */}
              {view === "universities" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <span className={labelCls}>Add a university you’re aiming for</span>
                    <UniversityTierField
                      value={targetUniversities}
                      onChange={setTargetUniversities}
                    />
                  </div>
                  <div>
                    <span className={labelCls}>Countries you’d consider (optional)</span>
                    <div
                      className="flex flex-wrap gap-2.5"
                      role="group"
                      aria-label="Countries you’d consider"
                    >
                      {COUNTRIES.map((c) => {
                        const active = countries.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            data-mag
                            data-hov
                            aria-pressed={active}
                            onClick={() =>
                              setCountries(
                                active ? countries.filter((x) => x !== c) : [...countries, c],
                              )
                            }
                            className={`cursor-none rounded-md border px-[18px] py-2.5 text-[14px] font-semibold transition ${
                              active
                                ? "border-foreground bg-foreground text-brand-paper"
                                : "border-border bg-background text-foreground"
                            }`}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STUDY (subjects + courses) ── */}
              {view === "study" && (
                <div className="flex flex-col gap-[22px]">
                  <div>
                    <span className={labelCls}>Subjects you take now</span>
                    <RefMultiSelect
                      kind="subject"
                      value={subjects}
                      onChange={setSubjects}
                      ariaLabel="Subjects you take"
                      placeholder="Physics, Economics…"
                    />
                  </div>
                  <div>
                    <span className={labelCls}>Courses or majors you’re considering</span>
                    <RefMultiSelect
                      kind="course"
                      value={courses}
                      onChange={setCourses}
                      ariaLabel="Courses or majors"
                      placeholder="Computer Science, Law…"
                    />
                  </div>
                </div>
              )}

              {/* ── SPORTS ── */}
              {view === "sports" && (
                <div>
                  <span className={labelCls}>Sports you play</span>
                  <RefMultiSelect
                    kind="sport"
                    value={sports}
                    onChange={setSports}
                    ariaLabel="Sports you play"
                    placeholder="Football, Tennis…"
                  />
                  <p className="mt-4 text-[13px] text-brand-ink-soft">
                    No sports? No problem — skip ahead.
                  </p>
                </div>
              )}

              {/* ── BEYOND (co-curriculars + projects) ── */}
              {view === "beyond" && (
                <div className="flex flex-col gap-[22px]">
                  <div>
                    <span className={labelCls}>Co-curriculars &amp; clubs</span>
                    <RefMultiSelect
                      kind="cocurricular"
                      value={cocurriculars}
                      onChange={setCocurriculars}
                      ariaLabel="Co-curriculars and clubs"
                      placeholder="Debate, MUN, Music…"
                    />
                  </div>
                  <div>
                    <span className={labelCls}>Academic / science projects</span>
                    <ProjectsField value={projects} onChange={setProjects} />
                  </div>
                </div>
              )}

              {/* ── ABOUT ── */}
              {view === "about" && (
                <div>
                  <span className={labelCls}>A short bio, in your words</span>
                  <textarea
                    className={`${inputCls} min-h-[150px] resize-y leading-relaxed`}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="What are you excited about? What are you working towards? A few honest lines beats a polished paragraph."
                  />
                  <span className="mt-1.5 block text-[12px] text-brand-ink-faint">
                    Optional — but mentors read this first.
                  </span>
                </div>
              )}

              {/* ── CONSENT (minor only) ── */}
              {view === "consent" && (
                <div className="flex flex-col gap-[18px]">
                  <div className="rounded-md border border-border p-[22px]">
                    <div className="mb-2.5 flex items-center gap-3">
                      <Mascot
                        shape="mentor"
                        color={MASCOTS.mentor.color}
                        expression="guiding"
                        size={46}
                        decorative
                      />
                      <span className="font-display text-[19px] font-extrabold">
                        A parent gives the green light — not you.
                      </span>
                    </div>
                    <p className="m-0 text-[14.5px] leading-relaxed text-brand-ink-soft">
                      The moment you create your account, we email{" "}
                      <b className="text-foreground">{parentEmail || "your guardian"}</b> a secure
                      consent link. They approve from their side — you never tick consent yourself.
                      You can explore mentors right away; your first session unlocks once they say
                      yes.
                    </p>
                  </div>
                  {!under18 && (
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelCls}>Parent’s email</span>
                        <input
                          className={inputCls}
                          type="email"
                          value={parentEmail}
                          onChange={(e) => setParentEmail(e.target.value)}
                          placeholder="parent@email.com"
                        />
                        {errors.parentEmail && <span className={errCls}>{errors.parentEmail}</span>}
                      </label>
                      <label className="block">
                        <span className={labelCls}>Parent’s phone</span>
                        <input
                          className={inputCls}
                          value={parentPhone}
                          onChange={(e) => setParentPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                        />
                        {errors.parentPhone && <span className={errCls}>{errors.parentPhone}</span>}
                      </label>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 text-[13px] text-brand-ink-faint">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    Consent is collected parent-side, by secure link. Nothing for you to sign here.
                  </div>
                </div>
              )}

              {/* ── ACCOUNT ── */}
              {view === "account" && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelCls}>Password</span>
                      <input
                        className={inputCls}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                      />
                      {errors.password && <span className={errCls}>{errors.password}</span>}
                    </label>
                    <label className="block">
                      <span className={labelCls}>Confirm password</span>
                      <input
                        className={inputCls}
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                      />
                      {errors.confirm && <span className={errCls}>{errors.confirm}</span>}
                    </label>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: pwW, background: pwColor }}
                      />
                    </div>
                    <span className="min-w-[64px] text-[11.5px] font-semibold text-brand-ink-faint">
                      {pwLabel}
                    </span>
                  </div>
                  {/* Checkbox box and the label+links are SIBLINGS (not nested):
                      a role=checkbox makes its descendants presentational, so links
                      inside it would be unreachable by screen readers, and keydown on
                      a nested link would bubble and toggle the box. Keeping them
                      separate makes the real <a> links keyboard- and AT-reachable so a
                      (often minor) user can actually open what they're agreeing to. */}
                  <div
                    className="flex items-start gap-3 rounded-md border px-4 py-3.5 transition"
                    style={{ borderColor: agreed ? "var(--primary)" : "var(--border)" }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={agreed}
                      aria-labelledby="agree-student-label"
                      data-mag
                      data-hov
                      onClick={() => {
                        setAgreed((a) => !a);
                        setErrors((e) => ({ ...e, agreed: "" }));
                      }}
                      className="mt-px flex h-[22px] w-[22px] shrink-0 cursor-none items-center justify-center rounded-[5px] border text-[14px] text-brand-paper transition"
                      style={{
                        borderColor: agreed ? "var(--foreground)" : "rgba(26,26,26,.3)",
                        background: agreed ? "var(--foreground)" : "transparent",
                      }}
                    >
                      {agreed ? "✓" : ""}
                    </button>
                    <span
                      id="agree-student-label"
                      className="text-[13.5px] leading-relaxed text-brand-ink-soft"
                    >
                      I agree to UniPlug’s{" "}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-none border-b-[1.5px] border-primary text-foreground"
                      >
                        Terms of Service
                      </a>
                      ,{" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-none border-b-[1.5px] border-primary text-foreground"
                      >
                        Privacy Policy
                      </a>
                      , and{" "}
                      <a
                        href="/community-guidelines"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-none border-b-[1.5px] border-primary text-foreground"
                      >
                        Code of Conduct
                      </a>
                      .
                    </span>
                  </div>
                  {errors.agreed && <span className={errCls}>{errors.agreed}</span>}
                  {serverError && (
                    <p role="alert" className="text-center text-xs text-destructive">
                      {serverError}
                    </p>
                  )}
                </div>
              )}

              {/* ── VERIFY (terminal: email confirmation) ── */}
              {view === "verify" && (
                <div>
                  <p className="m-0 text-[15.5px] leading-relaxed text-brand-ink-soft">
                    We sent a confirmation link to{" "}
                    <b className="text-foreground">{pendingEmail || email}</b>.{" "}
                    {minor && "We’ve also emailed your guardian a consent request. "}
                    Click it, then sign back in to finish your profile.
                  </p>
                  <div className="mt-6 flex items-center gap-[18px]">
                    <button
                      type="button"
                      data-hov
                      onClick={onResend}
                      disabled={resendState !== "idle"}
                      className="cursor-none border-b-[1.5px] border-primary text-[14px] font-semibold text-foreground disabled:opacity-60"
                    >
                      {resendState === "sending"
                        ? "Resending…"
                        : resendState === "sent"
                          ? "Sent ✓"
                          : "Resend email"}
                    </button>
                    <span role="status" aria-live="polite" className="sr-only">
                      {resendState === "sent" ? "Confirmation email resent" : ""}
                    </span>
                  </div>
                </div>
              )}

              {/* ── NAV ── */}
              {showNav && (
                <div className="mt-9 flex items-center gap-[18px]">
                  {canBack && (
                    <button
                      type="button"
                      data-hov
                      onClick={onBack}
                      className="cursor-none px-2 py-3.5 text-[15px] font-bold text-brand-ink-soft"
                    >
                      ← Back
                    </button>
                  )}
                  <button
                    type="button"
                    data-mag
                    data-hov
                    onClick={onNext}
                    disabled={submitting}
                    className="inline-flex cursor-none items-center gap-2.5 rounded-md bg-foreground px-[30px] py-4 text-[16px] font-bold text-brand-paper transition disabled:opacity-60"
                  >
                    {view === "account"
                      ? submitting
                        ? "Creating…"
                        : "Create account"
                      : "Continue"}{" "}
                    <span className="text-[18px]">→</span>
                  </button>
                  {SKIPPABLE.has(view) && (
                    <button
                      type="button"
                      data-hov
                      onClick={onNext}
                      className="cursor-none px-1.5 py-3.5 text-[14px] font-semibold text-brand-ink-faint"
                    >
                      Skip for now
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cinematic overlays ── */}
      {view === "arrival" && (
        <MotionConfig reducedMotion="user">
          <ArrivalBeat onBegin={begin} />
        </MotionConfig>
      )}
      {trans && <ActInterstitial words={trans.words} onDone={() => commitTrans()} />}
      {micro && (
        <MotionConfig reducedMotion="user">
          <AccountCreatedBeat />
        </MotionConfig>
      )}
    </div>
  );
}
