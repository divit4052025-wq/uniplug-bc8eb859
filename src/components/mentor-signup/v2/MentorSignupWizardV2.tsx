// Mentor-signup v2 — the cinematic, act-based pre-account wizard (anonymous, at
// /mentor-signup). A deliberate DARK inverted sibling of the student v2 wizard:
// an inverted LIGHT arrival → dark form acts with kinetic interstitials →
// "Account created." → "Check your inbox". The DATA CONTRACT is unchanged from
// the live mentor wizard: scalars ride in the auth.signUp metadata that
// handle_new_user reads (incl. code_of_conduct_version, already handled
// server-side); admits + the new "extra skills" are stashed on-device and
// replayed in the authenticated finalize step (/mentor-signup/finalize), which
// also owns the verification-document uploads + submit_mentor_application().
//
// 18+ is a client check only (isUnder18); server-side mentor age enforcement is a
// separately-tracked safeguarding item and is intentionally NOT added here.
import { useEffect, useRef, useState } from "react";
import { MotionConfig } from "motion/react";

import { Mascot, type MascotExpression } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { SPECIALTIES, SPECIALTY_MASCOT, type SpecialtyKey } from "@/components/mascots/specialty";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";
import { log, looksLikeEmailSendFailure } from "@/lib/log";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { CODE_OF_CONDUCT_VERSION, isUnder18, LEGAL_VERSION } from "@/components/signup/constants";
import type { RefItem } from "@/components/signup/types";
import { SignupCursor } from "@/components/student-signup/v2/SignupCursor";
import { FounderCompanion } from "@/components/student-signup/v2/FounderCompanion";
import {
  ActInterstitial,
  type InterstitialWord,
} from "@/components/student-signup/v2/ActInterstitial";
import { saveMentorDraft } from "../draft";
import { MentorArrivalBeat, MentorAccountCreatedBeat } from "./beats";

type View =
  | "arrival"
  | "identity"
  | "campus"
  | "admits"
  | "specialty"
  | "about"
  | "account"
  | "verify";

const STEPS: View[] = ["identity", "campus", "admits", "specialty", "about", "account"];

const META: Record<string, { kicker: string; title: string; expr: MascotExpression }> = {
  identity: {
    kicker: "Identity & credential",
    title: "Become the Plug you needed.",
    expr: "guiding",
  },
  campus: { kicker: "Where you study", title: "Your current campus.", expr: "thinking" },
  admits: { kicker: "Your track record", title: "The admits you can speak to.", expr: "focused" },
  specialty: { kicker: "Your edge", title: "The one thing you’re best at.", expr: "guiding" },
  about: { kicker: "In your words", title: "Your story.", expr: "happy" },
  account: { kicker: "The paperwork", title: "Make it official.", expr: "focused" },
  verify: { kicker: "One click to go", title: "Check your inbox.", expr: "happy" },
};

const ACT: Record<string, number> = {
  identity: 2,
  campus: 3,
  admits: 3,
  specialty: 3,
  about: 3,
  account: 4,
};

const PAPER = "var(--brand-paper)";
const ROSE = "var(--brand-rose)";
const ACCENT = "var(--primary)"; // the interstitial em-dash accent (= rose-deep)
const INTER: Record<number, InterstitialWord[]> = {
  3: [
    { text: "Now", color: PAPER },
    { text: "—", color: ACCENT },
    { text: "the", color: PAPER },
    { text: "road", color: PAPER },
    { text: "you’ve", color: PAPER },
    { text: "walked.", color: ROSE },
  ],
  4: [
    { text: "One", color: PAPER },
    { text: "last", color: PAPER },
    { text: "thing", color: PAPER },
    { text: "—", color: ACCENT },
    { text: "the", color: PAPER },
    { text: "paperwork.", color: ROSE },
  ],
};

// Year options — free-text in the metadata write (mentors.year is text). Covers
// 5-year/integrated/medical programmes + recent grads (high-value mentors).
const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "5th year", "Recent graduate"];

// Dark field vocabulary (light-on-dark; matches the design's IN styles).
const inputCls =
  "w-full rounded-md border border-[rgba(255,252,251,0.18)] bg-[rgba(255,252,251,0.04)] px-4 py-3.5 text-[16px] font-medium text-brand-paper outline-none transition placeholder:text-[rgba(255,252,251,0.38)] focus:border-brand-rose";
const labelCls = "mb-1.5 block text-[13px] font-semibold text-[rgba(255,252,251,0.72)]";
const errCls = "mt-1.5 block text-[12px] font-semibold text-[#E5765B]";
const helpCls = "mt-1.5 block text-[12px] text-[rgba(255,252,251,0.45)]";

function pwStrength(p: string): number {
  let n = 0;
  if (p.length >= 8) n += 1;
  if (/[A-Z]/.test(p)) n += 1;
  if (/[0-9]/.test(p)) n += 1;
  if (/[^A-Za-z0-9]/.test(p)) n += 1;
  return n;
}

export function MentorSignupWizardV2() {
  // Scalars → auth.signUp metadata.
  const [fullName, setFullName] = useState("");
  const [collegeEmail, setCollegeEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [university, setUniversity] = useState<RefItem[]>([]);
  const [year, setYear] = useState("");
  const [course, setCourse] = useState<RefItem[]>([]);
  const [bio, setBio] = useState("");

  // Stashed → replayed at finalize.
  const [admits, setAdmits] = useState<RefItem[]>([]);
  const [specialty, setSpecialty] = useState<SpecialtyKey | "">("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");

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

  // Move focus to the scene heading on every scene change (AT + keyboard).
  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);

  const firstName = fullName.trim().split(" ")[0] || "";
  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  function validate(key: View): Record<string, string> {
    const e: Record<string, string> = {};
    if (key === "identity") {
      if (!fullName.trim()) e.fullName = "Required";
      if (!isEmail(collegeEmail)) e.collegeEmail = "Enter a valid college email";
      if (phone.trim().length < 6) e.phone = "Enter a valid phone";
      const d = new Date(`${dob}T00:00:00`);
      if (!dob || Number.isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900)
        e.dob = "Enter a valid date of birth";
      else if (isUnder18(dob)) e.dob = "Mentors must be 18 or older";
    } else if (key === "campus") {
      if (university.length === 0) e.university = "Required";
      if (!year) e.year = "Pick your year";
      if (course.length === 0) e.course = "Required";
    } else if (key === "admits") {
      if (admits.length < 1) e.admits = "Add at least one admit you can speak to";
    } else if (key === "specialty") {
      if (!specialty) e.specialty = "Pick the one you’re best at";
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
  const begin = () => goTo("identity");

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

  const idxIn = (k: View) => STEPS.indexOf(k);
  const canBack = STEPS.includes(view) && idxIn(view) > 0;
  const onBack = () => {
    const i = idxIn(view);
    if (i > 0) goTo(STEPS[i - 1]);
  };

  const onNext = () => {
    if (!STEPS.includes(view)) return;
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
    const next = STEPS[idxIn(view) + 1];
    if (!next) return;
    if (ACT[next] > ACT[view]) playTrans(next);
    else goTo(next);
  };

  async function submit() {
    setServerError(null);
    setSubmitting(true);
    // Stash admits + specialty + skills for the authenticated finalize replay.
    saveMentorDraft({ admits, specialty: (specialty || "general") as SpecialtyKey, skills });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: collegeEmail.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/mentor-signup/finalize?welcome=1`,
          data: {
            role: "mentor",
            full_name: fullName.trim(),
            // The wizard validates 18+ on `dob` but previously dropped it here, so
            // mentors.date_of_birth was always NULL even though handle_new_user's
            // mentor branch is wired to store it. Persist it (mirrors the student
            // wizard) so the age is recorded + auditable. (Server-side age gate is
            // still owed — flagged separately; this just stops the data loss.)
            date_of_birth: dob,
            university: university[0]?.name ?? "",
            university_id: university[0]?.id ?? "",
            course: course[0]?.name ?? "",
            course_id: course[0]?.id ?? "",
            year,
            phone: phone.trim(),
            college_email: collegeEmail.trim(),
            bio: bio.trim(),
            specialty: specialty || "general",
            terms_version: LEGAL_VERSION,
            privacy_version: LEGAL_VERSION,
            mentor_agreement_version: LEGAL_VERSION,
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
          // Auto-confirmed (local dev) → finalize. Hard nav so ?welcome=1 lands.
          window.location.assign(`${window.location.origin}/mentor-signup/finalize?welcome=1`);
        } else {
          setPendingEmail(collegeEmail.trim());
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
        kind: "mentor_signup",
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
      options: { emailRedirectTo: `${window.location.origin}/mentor-signup/finalize?welcome=1` },
    });
    if (error) {
      log.error({
        surface: "web",
        event: "auth_email_send_failed",
        alert: looksLikeEmailSendFailure(error.message),
        kind: "mentor_signup_confirmation_resend",
        error: error.message,
      });
      setResendState("idle");
      return;
    }
    setResendState("sent");
  };

  const addSkill = () => {
    const v = skillDraft.trim();
    if (!v) return;
    if (!skills.some((s) => s.toLowerCase() === v.toLowerCase())) setSkills([...skills, v]);
    setSkillDraft("");
  };

  const onFocusCapture = () => {
    if (founderExpr !== "thinking") setFounderExpr("thinking");
  };
  const onBlurCapture = () => setFounderExpr(META[view]?.expr ?? "happy");

  const personalTitle = (() => {
    const m = META[view];
    if (!m) return "";
    if (view === "campus" && firstName) return `Where are you now, ${firstName}?`;
    if (view === "about" && firstName) return `Your story, ${firstName}.`;
    if (view === "verify") return `Check your inbox${firstName ? `, ${firstName}` : ""}.`;
    return m.title;
  })();

  const inFlow = view !== "arrival";
  const showNav = STEPS.includes(view);
  const pw = pwStrength(password);
  const pwW = ["8%", "30%", "55%", "80%", "100%"][pw];
  const pwColor = ["#6E655C", "#ED7E4A", "#F2D098", "#C5D9B0", "#9AD6C6"][pw];
  const pwLabel = ["Too short", "Weak", "Okay", "Good", "Strong"][pw];

  return (
    <div className="signup-wizard relative h-dvh overflow-hidden overscroll-none bg-brand-night text-brand-paper">
      <SignupCursor />

      {/* Persistent wordmark on the dark form. `-dark` = the light glyph FOR dark
          backgrounds (suffix = target bg). Wrapped in a positioned div so the
          Logo's own `relative` wrapper can't win over the absolute placement. */}
      <div className="absolute left-10 top-8 z-[5]">
        <Logo variant="wordmark-dark" size={34} />
      </div>

      {/* ── Dark form layer (the 6 steps + verify). One data-dark wrapper makes the
          magnetic cursor flip to the bright on-dark rose across the whole flow. ── */}
      {inFlow && (
        <div
          data-dark
          className="absolute inset-0 flex items-center justify-center px-8 py-16 sm:px-16"
        >
          <div className="flex max-h-full w-full max-w-[940px] items-center gap-10 lg:gap-14">
            <FounderCompanion
              expression={founderExpr}
              size={172}
              color="#F4B5AA"
              className="hidden shrink-0 self-center md:block"
            />

            <div
              className="hide-scrollbar max-h-full w-full max-w-[620px] flex-1 overflow-y-auto"
              onFocusCapture={onFocusCapture}
              onBlurCapture={onBlurCapture}
            >
              <p aria-live="assertive" className="sr-only">
                {Object.values(errors).filter(Boolean)[0] ?? ""}
              </p>
              <p aria-live="polite" className="sr-only">
                {showNav ? `Step ${idxIn(view) + 1} of ${STEPS.length}` : ""}
              </p>

              <div className="mb-7">
                <div className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-[rgba(255,252,251,0.5)]">
                  {META[view]?.kicker}
                </div>
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="m-0 text-balance font-display text-[clamp(30px,4.5vw,42px)] font-extrabold leading-tight tracking-[-0.022em] text-brand-paper outline-none"
                >
                  {personalTitle}
                </h1>
              </div>

              {/* ── IDENTITY ── */}
              {view === "identity" && (
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
                      <span className={labelCls}>College email</span>
                      <input
                        className={inputCls}
                        type="email"
                        value={collegeEmail}
                        onChange={(e) => setCollegeEmail(e.target.value)}
                        placeholder="you@college.ac.in"
                      />
                      {errors.collegeEmail && <span className={errCls}>{errors.collegeEmail}</span>}
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
                      className={`${inputCls} max-w-[240px] [color-scheme:dark]`}
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                    />
                    <span className={helpCls}>Mentors must be 18 or older.</span>
                    {errors.dob && <span className={errCls}>{errors.dob}</span>}
                  </label>
                  <p className={helpCls}>
                    You’ll upload a photo of your physical college ID after confirming your email.
                  </p>
                </div>
              )}

              {/* ── CAMPUS ── */}
              {view === "campus" && (
                <div className="flex flex-col gap-[18px]">
                  <div>
                    <span className={labelCls}>University you currently attend</span>
                    <RefMultiSelect
                      kind="university"
                      value={university}
                      onChange={setUniversity}
                      max={1}
                      closeOnSelect
                      ariaLabel="University you currently attend"
                      placeholder="Start typing your university…"
                    />
                    {errors.university && <span className={errCls}>{errors.university}</span>}
                  </div>
                  <div>
                    <span className={labelCls}>Year of study</span>
                    <div className="flex flex-wrap gap-2.5" role="group" aria-label="Year of study">
                      {YEARS.map((y) => {
                        const active = year === y;
                        return (
                          <button
                            key={y}
                            type="button"
                            data-mag
                            data-hov
                            aria-pressed={active}
                            onClick={() => {
                              setYear(active ? "" : y);
                              setErrors((e) => ({ ...e, year: "" }));
                            }}
                            className={`cursor-none rounded-md border px-[18px] py-2.5 text-[14px] font-semibold transition ${
                              active
                                ? "border-brand-rose bg-brand-rose text-[#1A1A1A]"
                                : "border-[rgba(255,252,251,0.18)] bg-[rgba(255,252,251,0.05)] text-brand-paper"
                            }`}
                          >
                            {y}
                          </button>
                        );
                      })}
                    </div>
                    {errors.year && <span className={errCls}>{errors.year}</span>}
                  </div>
                  <div>
                    <span className={labelCls}>Course / programme</span>
                    <RefMultiSelect
                      kind="course"
                      value={course}
                      onChange={setCourse}
                      max={1}
                      closeOnSelect
                      ariaLabel="Course or programme"
                      placeholder="B.Tech Computer Science, BA Economics…"
                    />
                    {errors.course && <span className={errCls}>{errors.course}</span>}
                  </div>
                </div>
              )}

              {/* ── ADMITS ── */}
              {view === "admits" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <span className={labelCls}>Universities you were admitted to</span>
                    <RefMultiSelect
                      kind="university"
                      value={admits}
                      onChange={setAdmits}
                      ariaLabel="Universities you were admitted to"
                      placeholder="Add admits…"
                    />
                    <span className={helpCls}>
                      Add every university you were admitted to — your matching anchor. You’ll
                      attach an acceptance proof for each after confirming your email.
                    </span>
                    {errors.admits && <span className={errCls}>{errors.admits}</span>}
                  </div>
                </div>
              )}

              {/* ── SPECIALTY ── */}
              {view === "specialty" && (
                <div>
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                    {SPECIALTIES.map((sp) => {
                      const active = specialty === sp.key;
                      const shape = SPECIALTY_MASCOT[sp.key];
                      return (
                        <button
                          key={sp.key}
                          type="button"
                          data-mag
                          data-hov
                          aria-pressed={active}
                          onClick={() => {
                            setSpecialty(sp.key);
                            setErrors((e) => ({ ...e, specialty: "" }));
                            setFounderExpr("celebrating");
                          }}
                          className={`cursor-none rounded-lg border px-3 pb-4 pt-5 text-center transition ${
                            active
                              ? "-translate-y-1 border-brand-rose bg-brand-rose/[0.12]"
                              : "border-[rgba(255,252,251,0.14)] bg-[rgba(255,252,251,0.03)]"
                          }`}
                        >
                          <div className="mx-auto flex h-[58px] w-[52px] items-end justify-center">
                            <Mascot
                              shape={shape}
                              color={MASCOTS[shape].color}
                              expression={active ? "celebrating" : "happy"}
                              size={52}
                              decorative
                            />
                          </div>
                          <div className="mt-2.5 text-[14px] font-bold leading-tight text-brand-paper">
                            {sp.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {errors.specialty && (
                    <span className={`${errCls} text-center`}>{errors.specialty}</span>
                  )}
                </div>
              )}

              {/* ── ABOUT ── */}
              {view === "about" && (
                <div className="flex flex-col gap-[22px]">
                  <div>
                    <span className={labelCls}>Your story</span>
                    <textarea
                      className={`${inputCls} min-h-[150px] resize-y leading-relaxed`}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="How did you get here, and who do you most want to help? A few honest lines beats a polished paragraph."
                    />
                    <span className={helpCls}>
                      Students read this first when they choose a mentor.
                    </span>
                  </div>
                  <div>
                    <span className={labelCls}>Extra skills you bring (optional)</span>
                    <input
                      className={inputCls}
                      value={skillDraft}
                      onChange={(e) => setSkillDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="Interview prep, scholarships, coding… press Enter"
                    />
                    {skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {skills.map((s, i) => (
                          <span
                            key={`${s}-${i}`}
                            className="inline-flex items-center gap-2 rounded-md border border-[rgba(255,252,251,0.16)] bg-[rgba(255,252,251,0.05)] px-3 py-2 text-[14px] font-semibold text-brand-paper"
                          >
                            {s}
                            <button
                              type="button"
                              data-hov
                              aria-label={`Remove ${s}`}
                              onClick={() => setSkills(skills.filter((_, j) => j !== i))}
                              className="cursor-none text-[15px] leading-none text-[rgba(255,252,251,0.5)]"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
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
                    <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[rgba(255,252,251,0.12)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: pwW, background: pwColor }}
                      />
                    </div>
                    <span className="min-w-[64px] text-[11.5px] font-semibold text-[rgba(255,252,251,0.5)]">
                      {pwLabel}
                    </span>
                  </div>
                  {/* Checkbox box and the label+links are SIBLINGS (not nested): a
                      role=checkbox makes descendants presentational, so nested links
                      would be unreachable by screen readers and keydown would bubble to
                      toggle the box. Separate keeps the real <a> links keyboard- and
                      AT-reachable. */}
                  <div
                    className="flex items-start gap-3 rounded-md border px-4 py-3.5 transition"
                    style={{ borderColor: agreed ? "var(--primary)" : "rgba(255,252,251,0.2)" }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={agreed}
                      aria-labelledby="agree-mentor-label"
                      data-mag
                      data-hov
                      onClick={() => {
                        setAgreed((a) => !a);
                        setErrors((e) => ({ ...e, agreed: "" }));
                      }}
                      className="mt-px flex h-[22px] w-[22px] shrink-0 cursor-none items-center justify-center rounded-[5px] border text-[14px] text-[#1A1A1A] transition"
                      style={{
                        borderColor: agreed ? "var(--brand-rose)" : "rgba(255,252,251,0.35)",
                        background: agreed ? "var(--brand-rose)" : "transparent",
                      }}
                    >
                      {agreed ? "✓" : ""}
                    </button>
                    <span
                      id="agree-mentor-label"
                      className="text-[13.5px] leading-relaxed text-[rgba(255,252,251,0.7)]"
                    >
                      I agree to UniPlug’s{" "}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-none border-b-[1.5px] border-primary text-brand-paper"
                      >
                        Terms &amp; Conditions
                      </a>
                      ,{" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-none border-b-[1.5px] border-primary text-brand-paper"
                      >
                        Privacy Policy
                      </a>
                      ,{" "}
                      <a
                        href="/mentor-terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-none border-b-[1.5px] border-primary text-brand-paper"
                      >
                        Mentor Agreement
                      </a>
                      , and{" "}
                      <a
                        href="/community-guidelines"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-none border-b-[1.5px] border-primary text-brand-paper"
                      >
                        Code of Conduct
                      </a>
                      .
                    </span>
                  </div>
                  {errors.agreed && <span className={errCls}>{errors.agreed}</span>}
                  {serverError && (
                    <p role="alert" className="text-center text-xs text-[#E5765B]">
                      {serverError}
                    </p>
                  )}
                </div>
              )}

              {/* ── VERIFY (terminal: email confirmation) ── */}
              {view === "verify" && (
                <div>
                  <p className="m-0 text-[15.5px] leading-relaxed text-[rgba(255,252,251,0.72)]">
                    We sent a confirmation link to{" "}
                    <b className="text-brand-paper">{pendingEmail || collegeEmail}</b>. Click it to
                    activate your account, then upload your documents to submit your application for
                    review.
                  </p>
                  <div className="mt-6 flex items-center gap-[18px]">
                    <button
                      type="button"
                      data-hov
                      onClick={onResend}
                      disabled={resendState !== "idle"}
                      className="cursor-none border-b-[1.5px] border-primary text-[14px] font-semibold text-brand-paper disabled:opacity-60"
                    >
                      {resendState === "sending"
                        ? "Resending…"
                        : resendState === "sent"
                          ? "Sent ✓"
                          : "Resend confirmation email"}
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
                      className="cursor-none px-2 py-3.5 text-[15px] font-bold text-[rgba(255,252,251,0.6)]"
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
                    className="inline-flex cursor-none items-center gap-2.5 rounded-md bg-brand-paper px-[30px] py-4 text-[16px] font-bold text-[#1A1A1A] transition disabled:opacity-60"
                  >
                    {view === "account"
                      ? submitting
                        ? "Creating…"
                        : "Create my account"
                      : "Continue"}{" "}
                    <span className="text-[18px]">→</span>
                  </button>
                  {view === "about" && (
                    <button
                      type="button"
                      data-hov
                      onClick={onNext}
                      className="cursor-none px-1.5 py-3.5 text-[14px] font-semibold text-[rgba(255,252,251,0.45)]"
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
          <MentorArrivalBeat onBegin={begin} />
        </MotionConfig>
      )}
      {trans && <ActInterstitial words={trans.words} onDone={() => commitTrans()} />}
      {micro && (
        <MotionConfig reducedMotion="user">
          <MentorAccountCreatedBeat />
        </MotionConfig>
      )}
    </div>
  );
}
