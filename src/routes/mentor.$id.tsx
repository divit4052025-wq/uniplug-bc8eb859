import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar, type SectionKey } from "@/components/dashboard/DashboardSidebar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import MentorCalendar from "@/components/calendar/MentorCalendar";
import { ErrorBanner } from "@/components/ui/error-banner";

export const Route = createFileRoute("/mentor/$id")({
  head: () => ({
    meta: [
      { title: "Mentor Profile — UniPlug" },
      { name: "description", content: "Book a one-on-one mentorship session with a verified university student." },
    ],
  }),
  component: MentorProfilePage,
});

type MentorProfile = {
  id: string;
  full_name: string;
  university: string;
  countries: string[];
  course: string;
  year: string;
  price_inr: number;
  bio: string | null;
  topics: string[] | null;
  photo_url: string | null;
};

type Review = {
  id: string;
  student_id: string;
  rating: number;
  review: string;
  created_at: string;
  studentName?: string;
};

type Page = {
  mentor: MentorProfile | null;
  reviews: Review[];
  sessionCount: number;
};

function MentorProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [active, setActive] = useState<SectionKey>("browse");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/login" });
        return;
      }
      setAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const { data, isLoading, isError, refetch } = useQuery<Page>({
    queryKey: ["mentor-profile-page", id],
    enabled: authReady,
    queryFn: async () => {
      const { data: profile, error: pErr } = await supabase.rpc(
        "get_mentor_public_profile",
        { _mentor_id: id },
      );
      if (pErr) throw pErr;
      const mentor: MentorProfile | undefined = ((profile ?? []) as MentorProfile[])[0];
      if (!mentor) return { mentor: null, reviews: [], sessionCount: 0 };

      const { data: rev, error: rErr } = await supabase
        .from("reviews")
        .select("id, student_id, rating, review, created_at")
        .eq("mentor_id", id)
        .order("created_at", { ascending: false });
      if (rErr) throw rErr;
      const reviewRows: Review[] = (rev ?? []) as Review[];
      const studentIds = Array.from(new Set(reviewRows.map((r) => r.student_id)));
      let nameMap = new Map<string, string>();
      if (studentIds.length) {
        const { data: names, error: nErr } = await supabase.rpc(
          "get_review_student_names",
          { _ids: studentIds },
        );
        if (nErr) throw nErr;
        nameMap = new Map(
          ((names ?? []) as { id: string; full_name: string }[]).map((n) => [n.id, n.full_name]),
        );
      }
      const reviews = reviewRows.map((r) => ({
        ...r,
        studentName: nameMap.get(r.student_id) ?? "Student",
      }));

      const { count, error: cErr } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("mentor_id", id)
        .eq("status", "completed");
      if (cErr) throw cErr;
      return { mentor, reviews, sessionCount: count ?? 0 };
    },
  });

  const mentor = data?.mentor ?? null;
  const reviews = data?.reviews ?? [];
  const sessionCount = data?.sessionCount ?? 0;
  const notFound = !isLoading && !isError && !mentor;

  const onSelectSection = (key: SectionKey) => {
    setActive(key);
    if (key === "browse") return;
    navigate({ to: "/dashboard" });
  };

  if (!authReady || isLoading) return <div className="min-h-screen bg-[#FFFCFB]" />;

  if (isError) {
    return (
      <div className="min-h-screen bg-[#FFFCFB]">
        <DashboardSidebar active={active} onSelect={onSelectSection} />
        <main className="md:ml-[240px]">
          <div className="mx-auto max-w-2xl px-6 py-24">
            <ErrorBanner message="Couldn't load this mentor right now." onRetry={() => void refetch()} />
          </div>
        </main>
        <MobileBottomNav active={active} onSelect={onSelectSection} />
      </div>
    );
  }

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
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "New";

  const scrollToBooking = () => {
    document.getElementById("booking-widget")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <DashboardSidebar active={active} onSelect={onSelectSection} />

      <main className="pb-24 md:ml-[240px] md:pb-0">
        <section className="bg-[#1A1A1A] px-5 py-10 sm:px-8 md:px-12 md:py-14">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="relative">
                {mentor.photo_url ? (
                  <img
                    src={mentor.photo_url}
                    alt={mentor.full_name}
                    className="h-[120px] w-[120px] rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-[120px] w-[120px] place-content-center rounded-full bg-[#EDE0DB] font-display text-[36px] font-semibold text-[#1A1A1A]">
                    {initials}
                  </div>
                )}
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
                <StatPill label={String(sessionCount)} sub="Sessions" />
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

        <section className="bg-[#FFFCFB] px-5 py-10 sm:px-8 md:px-12 md:py-14">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1fr_360px]">
            <div className="space-y-8">
              <div>
                <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1A1A]">About Me</h2>
                <p className="mt-3 text-[16px] leading-relaxed text-[#1A1A1A]/80">
                  {mentor.bio ?? "This mentor hasn't added a bio yet."}
                </p>
              </div>

              {mentor.topics && mentor.topics.length > 0 && (
                <div>
                  <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1A1A]">I Can Help You With</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {mentor.topics.map((t) => (
                      <span key={t} className="rounded-full bg-[#1A1A1A] px-3.5 py-1.5 text-[12px] font-medium text-[#FFFCFB]">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1A1A]">Universities I Got Into</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#EDE0DB] px-3.5 py-1.5 text-[12px] font-medium text-[#1A1A1A]">{mentor.university}</span>
                </div>
              </div>
            </div>

            <div id="booking-widget">
              <MentorCalendar
                mentorId={mentor.id}
                mentorName={mentor.full_name ?? "this mentor"}
                pricePerSessionInr={mentor.price_inr}
              />
            </div>
          </div>
        </section>

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
