import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Calendar, Check, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar, type SectionKey } from "@/components/dashboard/DashboardSidebar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";

export const Route = createFileRoute("/mentor/$id")({
  head: () => ({
    meta: [
      { title: "Mentor Profile — UniPlug" },
      { name: "description", content: "Book a one-on-one mentorship session with a verified university student." },
    ],
  }),
  component: MentorProfilePage,
});

const DURATION = 30;

type MentorProfile = {
  id: string;
  full_name: string;
  university: string;
  countries: string[];
  course: string;
  year: string;
  price_inr: number;
};

type Review = {
  id: string;
  student_id: string;
  rating: number;
  review: string;
  created_at: string;
  studentName?: string;
};

const PLACEHOLDER_BIOS: Record<string, { bio: string; topics: string[]; admits: string[] }> = {
  default: {
    bio: "I help high-school students navigate competitive university applications with clarity and strategy. From shortlisting to essays to interview prep, I share what actually worked for me.",
    topics: ["Personal Statement", "Interview Prep", "Course Selection", "Shortlisting", "Application Strategy"],
    admits: [],
  },
};

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function MentorProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<SectionKey>("browse");
  const [mentor, setMentor] = useState<MentorProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/login" });
        return;
      }
      const { data: profile } = await (supabase as any).rpc("get_mentor_public_profile", { _mentor_id: id });
      const m: MentorProfile | undefined = (profile ?? [])[0];
      if (!m) {
        setNotFound(true);
        setReady(true);
        return;
      }
      setMentor(m);
      const { data: rev } = await (supabase as any)
        .from("reviews")
        .select("id, student_id, rating, review, created_at")
        .eq("mentor_id", id)
        .order("created_at", { ascending: false });
      const reviewRows: Review[] = rev ?? [];
      const studentIds = Array.from(new Set(reviewRows.map((r) => r.student_id)));
      let nameMap = new Map<string, string>();
      if (studentIds.length) {
        const { data: names } = await (supabase as any).rpc("get_review_student_names", { _ids: studentIds });
        nameMap = new Map((names ?? []).map((n: { id: string; full_name: string }) => [n.id, n.full_name]));
      }
      setReviews(reviewRows.map((r) => ({ ...r, studentName: nameMap.get(r.student_id) ?? "Student" })));
      setReady(true);
    };
    void init();
  }, [id, navigate]);

  const onSelectSection = (key: SectionKey) => {
    setActive(key);
    if (key === "browse") return;
    navigate({ to: "/dashboard" });
  };

  if (!ready) return <div className="min-h-screen bg-[#FFFCFB]" />;

  if (notFound || !mentor) {
    return (
      <div className="min-h-screen bg-[#FFFCFB]">
        <DashboardSidebar active={active} onSelect={onSelectSection} />
        <main className="md:ml-[240px]">
          <div className="mx-auto max-w-2xl px-6 py-24 text-center">
            <h1 className="font-display text-[28px] font-semibold text-[#1A1A1A]">Mentor not found</h1>
            <p className="mt-2 text-[14px] text-[#1A1A1A]/60">This profile may not be available or hasn't been approved yet.</p>
            <Link to="/browse" className="mt-6 inline-block rounded-full bg-[#C4907F] px-5 py-2.5 text-[13px] font-medium text-[#FFFCFB]">Browse mentors</Link>
          </div>
        </main>
        <MobileBottomNav active={active} onSelect={onSelectSection} />
      </div>
    );
  }

  const initials = mentor.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const bioData = PLACEHOLDER_BIOS.default;
  const topics = bioData.topics;
  const admits = bioData.admits.length ? bioData.admits : [mentor.university];
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "New";

  const scrollToBooking = () => {
    document.getElementById("booking-widget")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <DashboardSidebar active={active} onSelect={onSelectSection} />

      <main className="pb-24 md:ml-[240px] md:pb-0">
        {/* Banner */}
        <section className="bg-[#1A1A1A] px-5 py-10 sm:px-8 md:px-12 md:py-14">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="relative">
                <div className="grid h-[120px] w-[120px] place-content-center rounded-full bg-[#EDE0DB] font-display text-[36px] font-semibold text-[#1A1A1A]">
                  {initials}
                </div>
                <span className="absolute -bottom-1 -right-1 grid h-9 w-9 place-content-center rounded-full bg-[#C4907F] ring-4 ring-[#1A1A1A]">
                  <BadgeCheck className="h-5 w-5 text-[#FFFCFB]" />
                </span>
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-[28px] font-semibold leading-tight text-[#FFFCFB] sm:text-[36px]">{mentor.full_name}</h1>
                <p className="mt-1 text-[16px] text-[#E8C4B8] sm:text-[18px]">{mentor.university}</p>
                <p className="mt-0.5 text-[14px] text-[#EDE0DB]/70 sm:text-[16px]">{mentor.course} · {mentor.year}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#C4907F] px-3 py-1 text-[12px] font-medium text-[#FFFCFB]">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified Plug
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <StatPill icon={<Star className="h-3.5 w-3.5 fill-[#C4907F] text-[#C4907F]" />} label={String(avgRating)} sub="Rating" />
                <StatPill label={String(reviews.length)} sub="Sessions" />
                <StatPill label={String(mentor.countries?.length || 1)} sub="Countries" />
              </div>
              <button
                onClick={scrollToBooking}
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[14px] font-medium text-[#FFFCFB] transition hover:opacity-90"
              >
                Book a Session
              </button>
            </div>
          </div>
        </section>

        {/* About + Booking */}
        <section className="bg-[#FFFCFB] px-5 py-10 sm:px-8 md:px-12 md:py-14">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1fr_360px]">
            <div className="space-y-8">
              <div>
                <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1A1A]">About Me</h2>
                <p className="mt-3 text-[16px] leading-relaxed text-[#1A1A1A]/80">{bioData.bio}</p>
              </div>

              <div>
                <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1A1A]">I Can Help You With</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {topics.map((t) => (
                    <span key={t} className="rounded-full bg-[#1A1A1A] px-3.5 py-1.5 text-[12px] font-medium text-[#FFFCFB]">{t}</span>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1A1A]">Universities I Got Into</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {admits.map((u) => (
                    <span key={u} className="rounded-full bg-[#EDE0DB] px-3.5 py-1.5 text-[12px] font-medium text-[#1A1A1A]">{u}</span>
                  ))}
                </div>
              </div>
            </div>

            <div id="booking-widget">
              <BookingWidget mentor={mentor} />
            </div>
          </div>
        </section>

        {/* Reviews */}
        <section className="bg-[#EDE0DB] px-5 py-10 sm:px-8 md:px-12 md:py-14">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1A1A]">Reviews</h2>
            {reviews.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-[#E8C4B8] bg-[#FFFCFB] p-8 text-center">
                <p className="text-[14px] text-[#1A1A1A]/70">No reviews yet — be the first to book a session.</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {reviews.map((r) => {
                  const firstName = (r.studentName ?? "Student").split(" ")[0];
                  return (
                    <article key={r.id} className="rounded-2xl bg-[#FFFCFB] p-5">
                      <div className="flex items-center justify-between">
                        <p className="font-display text-[16px] font-semibold text-[#1A1A1A]">{firstName}</p>
                        <p className="text-[12px] text-[#1A1A1A]/50">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                      </div>
                      <div className="mt-1 flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-[#C4907F] text-[#C4907F]" : "text-[#1A1A1A]/20"}`} />
                        ))}
                      </div>
                      {r.review && <p className="mt-3 text-[14px] leading-relaxed text-[#1A1A1A]/80">{r.review}</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      <MobileBottomNav active={active} onSelect={onSelectSection} />
    </div>
  );
}

function StatPill({ icon, label, sub }: { icon?: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[#FFFCFB]/10 px-3.5 py-2 backdrop-blur">
      {icon}
      <span className="text-[13px] font-semibold text-[#FFFCFB]">{label}</span>
      <span className="text-[11px] uppercase tracking-wider text-[#EDE0DB]/70">{sub}</span>
    </div>
  );
}

function BookingWidget({ mentor }: { mentor: MentorProfile }) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string>(todayISO());
  const [slot, setSlot] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadSlots = async () => {
      setLoadingSlots(true);
      setError(null);
      const day = new Date(`${date}T00:00:00`).getDay();
      const [{ data: availability, error: aErr }, { data: bookings, error: bErr }] = await Promise.all([
        supabase.from("mentor_availability").select("start_hour").eq("mentor_id", mentor.id).eq("day_of_week", day),
        (supabase as any).from("bookings").select("time_slot").eq("mentor_id", mentor.id).eq("date", date).eq("status", "confirmed"),
      ]);
      if (cancelled) return;
      if (aErr || bErr) {
        setError("Could not load slots.");
        setAvailableSlots([]);
        setLoadingSlots(false);
        return;
      }
      const booked = new Set((bookings ?? []).map((b: { time_slot: string }) => b.time_slot));
      const slots = (availability ?? [])
        .map((a) => `${String(a.start_hour).padStart(2, "0")}:00`)
        .filter((s) => !booked.has(s))
        .sort();
      setAvailableSlots(slots);
      if (slot && !slots.includes(slot)) setSlot(null);
      setLoadingSlots(false);
    };
    void loadSlots();
    return () => { cancelled = true; };
  }, [date, mentor.id, slot]);

  const confirm = async () => {
    if (!slot) { setError("Pick a time slot."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const studentId = sess.session?.user.id;
      if (!studentId) throw new Error("You must be logged in to book.");
      const { error: insErr } = await (supabase as any).from("bookings").insert({
        mentor_id: mentor.id,
        student_id: studentId,
        date,
        time_slot: slot,
        duration: DURATION,
        price: mentor.price_inr,
        status: "confirmed",
      });
      if (insErr) throw insErr;
      setSuccess(true);
      setTimeout(() => navigate({ to: "/dashboard" }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book session.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl border border-[#EDE0DB] bg-[#FFFCFB] p-6 text-center shadow-[0_20px_40px_-20px_rgba(26,26,26,0.15)]">
        <div className="mx-auto grid h-12 w-12 place-content-center rounded-full bg-[#C4907F]">
          <Check className="h-6 w-6 text-[#FFFCFB]" />
        </div>
        <h3 className="mt-4 font-display text-[20px] font-semibold text-[#1A1A1A]">Your session is booked</h3>
        <p className="mt-1 text-[13px] text-[#1A1A1A]/70">Check your email for the video call link.</p>
      </div>
    );
  }

  return (
    <div className="sticky top-6 rounded-3xl border border-[#EDE0DB] bg-[#FFFCFB] p-6 shadow-[0_20px_40px_-20px_rgba(26,26,26,0.15)]">
      <h3 className="font-display text-[20px] font-semibold text-[#1A1A1A]">Book a session</h3>
      <div className="mt-5 space-y-5">
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[#1A1A1A]/70">Select a date</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/40" />
            <input
              type="date"
              min={todayISO()}
              value={date}
              onChange={(e) => { setDate(e.target.value); setSlot(null); }}
              className="w-full rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] py-2.5 pl-9 pr-3 text-[13px] text-[#1A1A1A] focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[#1A1A1A]/70">Available time slots</label>
          <div className="flex flex-wrap gap-2">
            {loadingSlots && <p className="text-[13px] text-[#1A1A1A]/60">Loading…</p>}
            {!loadingSlots && availableSlots.length === 0 && <p className="text-[13px] text-[#1A1A1A]/60">No slots for this date.</p>}
            {!loadingSlots && availableSlots.map((s) => {
              const selected = slot === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition ${selected ? "bg-[#C4907F] text-[#FFFCFB]" : "bg-[#EDE0DB] text-[#1A1A1A] hover:bg-[#E8C4B8]"}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-[#EDE0DB] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1A1A1A]/60">Duration</p>
            <p className="mt-0.5 text-[13px] font-medium text-[#1A1A1A]">{DURATION} minutes</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1A1A1A]/60">Price</p>
            <p className="mt-0.5 font-display text-[18px] font-semibold text-[#1A1A1A]">₹{mentor.price_inr.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {error && <p className="text-[13px] text-destructive">{error}</p>}

        <button
          type="button"
          onClick={confirm}
          disabled={submitting || !slot}
          className="w-full rounded-full bg-[#C4907F] py-3 text-[13px] font-medium text-[#FFFCFB] transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Booking…" : "Confirm Booking"}
        </button>
      </div>
    </div>
  );
}