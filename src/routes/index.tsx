import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { Logo } from "@/components/site/Logo";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UniPlug — Your College Plug" },
      {
        name: "description",
        content:
          "Connect with university students already living your dream. 1:1 mentorship for Indian high schoolers applying to top universities worldwide.",
      },
      { property: "og:title", content: "UniPlug — Your College Plug" },
      {
        property: "og:description",
        content:
          "Real advice from verified university student mentors. Browse Plugs, book a session, level up.",
      },
    ],
  }),
  component: HomePage,
});

const stats = [
  "500+ Verified Plugs",
  "12 Countries",
  "4.9 Average Rating",
];

type HomeMentor = {
  id: string;
  name: string;
  university: string;
  course: string;
  tags: string[];
  initials: string;
};

const steps = [
  {
    n: "01",
    title: "Browse Plugs",
    body: "Find a university student who has been exactly where you want to go.",
  },
  {
    n: "02",
    title: "Book a Session",
    body: "Pick a time, pay securely, get a private video link sent instantly.",
  },
  {
    n: "03",
    title: "Level Up",
    body: "Real talk, real notes, real results. Your next move starts here.",
  },
];

const universities = [
  "Oxford",
  "IIT Bombay",
  "Warwick",
  "NUS",
  "UCL",
  "LSE",
  "Cambridge",
  "Imperial",
];

function HomePage() {
  const navigate = useNavigate();
  const [mentors, setMentors] = useState<HomeMentor[]>([]);
  const [mentorsReady, setMentorsReady] = useState(false);

  useEffect(() => {
    supabase.rpc("list_approved_mentor_profiles" as any).then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        const mapped: HomeMentor[] = (data as any[]).slice(0, 4).map((m) => ({
          id: m.id,
          name: m.full_name,
          university: m.university,
          course: `${m.course} · ${m.year}`,
          tags: [m.course, ...(m.countries ?? []).slice(0, 1)].filter(Boolean),
          initials: m.full_name.split(" ").map((p: string) => p[0]).slice(0, 2).join(""),
        }));
        setMentors(mapped);
      }
      setMentorsReady(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <Nav />

      {/* SECTION 1 — HERO */}
      <section className="relative bg-[#1A1A1A] text-white" style={{ minHeight: "calc(100vh - 73px)" }}>
        <div className="relative mx-auto flex max-w-7xl flex-col items-center justify-center px-6 md:px-10" style={{ minHeight: "calc(100vh - 73px)" }}>
          {/* Centered hero content */}
          <div className="flex flex-col items-center text-center animate-hero-rise">
            <h1 className="sr-only">UniPlug</h1>
            <Logo variant="wordmark-dark" size={240} />
            <p className="mt-6 max-w-xl text-[18px] font-light text-[#E8C4B8] -translate-x-12">
              Connect with students already living your dream.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2 — MENTORS */}
      {mentorsReady && mentors.length > 0 && (
        <section className="bg-[#FFFCFB] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <p className="text-[12px] font-medium uppercase text-[#C4907F]" style={{ letterSpacing: "4px" }}>
              Meet Your Plugs
            </p>
          </div>
          <div className="relative mt-8">
            <div className="hide-scrollbar flex gap-5 overflow-x-auto px-6 pb-4 md:px-10">
              {mentors.map((m) => (
                <article
                  key={m.id}
                  className="flex shrink-0 flex-col rounded-2xl border border-[#E8C4B8] bg-[#EDE0DB] p-6"
                  style={{ width: "280px" }}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1A1A1A] text-[16px] font-medium text-[#FFFCFB]">
                    {m.initials}
                  </div>
                  <h3 className="mt-4 font-display text-[20px] font-bold text-[#1A1A1A]" style={{ letterSpacing: "-0.01em" }}>
                    {m.name}
                  </h3>
                  <p className="mt-1 text-[14px] font-medium text-[#C4907F]">{m.university}</p>
                  <p className="mt-1 text-[13px] text-[#1A1A1A]/60">{m.course}</p>
                  {m.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full bg-[#1A1A1A] px-2.5 py-1 text-[11px] font-medium text-[#FFFCFB]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-1 text-[#C4907F]">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="text-[13px] font-medium">Verified</span>
                  </div>
                  <button
                    onClick={() => navigate({ to: "/browse" })}
                    className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#C4907F] text-[13px] font-medium text-white transition hover:opacity-90"
                  >
                    Book Now
                  </button>
                </article>
              ))}
              <div className="shrink-0" style={{ width: "1px" }} />
            </div>
            {/* Right edge fade */}
            <div
              className="pointer-events-none absolute right-0 top-0 h-full w-24"
              style={{ background: "linear-gradient(to left, #FFFCFB, transparent)" }}
            />
          </div>
        </section>
      )}

      {/* SECTION 3 — HOW IT WORKS */}
      <section className="bg-[#1A1A1A] py-20 text-white md:py-28">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="border-t border-[#333333] pt-10">
            <div className="grid gap-12 md:grid-cols-3 md:gap-10">
              {steps.map((s) => (
                <div key={s.n} className="md:border-l-0 md:pl-0">
                  <div className="font-display font-bold text-[#E8C4B8]" style={{ fontSize: "80px", lineHeight: 1 }}>
                    {s.n}
                  </div>
                  <h3 className="mt-4 font-display text-[24px] font-semibold text-white">{s.title}</h3>
                  <p className="mt-3 max-w-xs text-[15px] font-light text-[#EDE0DB]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 — STATEMENT */}
      <section className="bg-[#FFFCFB] py-32 md:py-44">
        <div className="mx-auto max-w-5xl px-6 text-center md:px-10">
          <p
            className="font-display text-[#1A1A1A]"
            style={{
              fontSize: "clamp(36px, 5.5vw, 64px)",
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Be the senior you wish you'd had.
          </p>
        </div>
      </section>

      {/* SECTION 5 — SOCIAL PROOF STRIP */}
      <section className="bg-[#EDE0DB] py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-6 text-[14px] text-[#1A1A1A] md:px-10">
          <span>Plugs currently studying at</span>
          {universities.map((u) => (
            <span
              key={u}
              className="inline-flex items-center rounded-full bg-[#1A1A1A] text-[12px] font-medium text-[#FFFCFB]"
              style={{ padding: "8px 16px" }}
            >
              {u}
            </span>
          ))}
        </div>
      </section>

      {/* SECTION 6 — DUAL CTA */}
      <section className="bg-[#1A1A1A] py-20 text-white md:py-28">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="grid gap-14 md:grid-cols-2 md:gap-0">
            <div className="md:pr-16">
              <p
                className="text-[11px] font-medium uppercase text-[#E8C4B8]"
                style={{ letterSpacing: "3px" }}
              >
                For Students
              </p>
              <h2
                className="mt-4 font-display font-bold text-white"
                style={{ fontSize: "clamp(40px, 5vw, 56px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
              >
                Find Your Plug
              </h2>
              <p className="mt-5 max-w-md text-[15px] font-light text-[#EDE0DB]">
                Get real advice from someone who has been exactly where you want to go.
              </p>
              <Link
                to="/student-signup"
                className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-[#C4907F] px-8 text-[14px] font-medium text-white transition hover:opacity-90"
              >
                Get Started
              </Link>
            </div>
            <div className="border-t border-[#333333] pt-14 md:border-l md:border-t-0 md:pl-16 md:pt-0">
              <p
                className="text-[11px] font-medium uppercase text-[#E8C4B8]"
                style={{ letterSpacing: "3px" }}
              >
                For Mentors
              </p>
              <h2
                className="mt-4 font-display font-bold text-white"
                style={{ fontSize: "clamp(40px, 5vw, 56px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
              >
                Become a Plug
              </h2>
              <p className="mt-5 max-w-md text-[15px] font-light text-[#EDE0DB]">
                Share your story, open doors, get paid.
              </p>
              <Link
                to="/mentor-signup"
                className="mt-8 inline-flex h-12 items-center justify-center rounded-full border border-white px-8 text-[14px] font-medium text-white transition hover:bg-white hover:text-[#1A1A1A]"
              >
                Apply Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
