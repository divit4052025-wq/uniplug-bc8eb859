import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { useReveal } from "@/hooks/use-reveal";
import { Search, CalendarCheck, Sparkles, MessageCircle, ShieldCheck, Clock, Star } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UniPlug — Your College Plug On Demand" },
      {
        name: "description",
        content:
          "Connect with university students already living your dream — paid 1:1 mentorship for Indian high schoolers applying to top universities.",
      },
      { property: "og:title", content: "UniPlug — Your College Plug On Demand" },
      {
        property: "og:description",
        content:
          "Real advice, real stories, real results. Book a Plug — a verified university student mentor — for one-on-one guidance.",
      },
    ],
  }),
  component: Home,
});

const steps = [
  {
    icon: Search,
    title: "Browse Plugs",
    desc: "Find a university student who has been exactly where you want to go.",
  },
  {
    icon: CalendarCheck,
    title: "Book a Session",
    desc: "Pick a time, pay securely, get a private video link sent to you.",
  },
  {
    icon: Sparkles,
    title: "Level Up",
    desc: "Get real talk, take notes, make your next move.",
  },
];

const mentors = [
  {
    name: "Aanya Mehta",
    uni: "University of Oxford",
    course: "PPE",
    year: "2nd Year",
    tags: ["Personal Statement", "Oxbridge Interviews"],
    rating: 4.9,
  },
  {
    name: "Rohan Iyer",
    uni: "IIT Bombay",
    course: "Computer Science",
    year: "3rd Year",
    tags: ["JEE Strategy", "CS Branch Choice"],
    rating: 4.8,
  },
  {
    name: "Saanvi Kapoor",
    uni: "NUS Singapore",
    course: "Business Analytics",
    year: "Final Year",
    tags: ["SAT Prep", "Scholarship Apps"],
    rating: 5.0,
  },
];

const values = [
  {
    icon: MessageCircle,
    title: "Real Talk",
    desc: "Advice from people actually living it — not textbooks.",
  },
  {
    icon: ShieldCheck,
    title: "Verified Plugs",
    desc: "Every mentor is manually verified by our team.",
  },
  {
    icon: Clock,
    title: "Your Pace",
    desc: "Book when you want, cancel anytime, no pressure.",
  },
];

const unis = ["Oxford", "IIT", "Warwick", "NUS", "UCL", "LSE", "Cambridge", "Imperial"];

function Home() {
  useReveal();
  return (
    <div className="min-h-screen bg-background">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-foreground text-background">
        <div className="aurora" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:py-40">
          <div className="max-w-4xl animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-background/20 bg-background/5 px-4 py-1.5 text-xs uppercase tracking-widest text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" /> Mentorship, unfiltered
            </span>
            <h1 className="mt-6 font-display text-5xl leading-[1.02] text-background sm:text-7xl lg:text-8xl">
              Your College <span className="text-secondary">Plug</span>
              <br /> On Demand
            </h1>
            <p className="mt-7 max-w-2xl text-lg font-light text-secondary sm:text-xl">
              Connect with students already living your dream — real advice, real stories,
              real results.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4">
              <Link
                to="/student-signup"
                className="rounded-full bg-primary px-8 py-4 text-center text-base font-semibold text-primary-foreground shadow-lift transition hover:-translate-y-0.5 hover:opacity-95"
              >
                Find Your Plug
              </Link>
              <Link
                to="/mentor-signup"
                className="rounded-full border-2 border-background px-8 py-4 text-center text-base font-semibold text-background transition hover:bg-background hover:text-foreground"
              >
                Become a Plug
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-background py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="reveal max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              The flow
            </p>
            <h2 className="mt-3 font-display text-4xl text-foreground sm:text-5xl lg:text-6xl">
              How It Works
            </h2>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="reveal hover-lift rounded-3xl bg-card p-8 shadow-card"
                data-delay={i * 120}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background">
                  <s.icon className="h-6 w-6" />
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <span className="font-display text-3xl text-primary">0{i + 1}</span>
                  <h3 className="font-display text-2xl text-foreground">{s.title}</h3>
                </div>
                <p className="mt-3 text-base font-light text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Meet your plugs */}
      <section className="bg-background pb-24 sm:pb-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="reveal flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                The roster
              </p>
              <h2 className="mt-3 font-display text-4xl text-foreground sm:text-5xl lg:text-6xl">
                Meet Your Plugs
              </h2>
            </div>
            <p className="text-sm font-light text-muted-foreground">
              Hand-picked, manually verified, ridiculously helpful.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {mentors.map((m, i) => (
              <article
                key={m.name}
                className="reveal hover-lift group rounded-3xl bg-card p-7 shadow-card"
                data-delay={i * 120}
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 overflow-hidden rounded-full bg-secondary ring-4 ring-background">
                    <div
                      className="h-full w-full"
                      style={{
                        background:
                          "radial-gradient(circle at 30% 30%, var(--brand-pink), var(--brand-brown))",
                      }}
                    />
                  </div>
                  <div>
                    <h3 className="font-display text-xl text-foreground">{m.name}</h3>
                    <p className="text-sm font-light text-muted-foreground">
                      {m.uni}
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-1 text-sm font-light text-foreground/80">
                  <p>{m.course}</p>
                  <p className="text-muted-foreground">{m.year}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {m.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-1 text-foreground">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`h-4 w-4 ${
                        idx < Math.round(m.rating)
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-sm font-medium">{m.rating.toFixed(1)}</span>
                </div>
                <button className="mt-6 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:opacity-95">
                  Book Now
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Why UniPlug */}
      <section className="bg-foreground py-24 text-background sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="reveal max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
              Why us
            </p>
            <h2 className="mt-3 font-display text-4xl text-background sm:text-5xl lg:text-6xl">
              Why UniPlug
            </h2>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {values.map((v, i) => (
              <div
                key={v.title}
                className="reveal hover-lift rounded-3xl border border-background/10 bg-background/[0.04] p-8 backdrop-blur"
                data-delay={i * 120}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground">
                  <v.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 font-display text-2xl text-secondary">{v.title}</h3>
                <p className="mt-3 text-base font-light text-background/75">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="bg-background py-16">
        <div className="reveal mx-auto max-w-6xl px-5 text-center sm:px-8">
          <p className="text-sm font-light text-muted-foreground sm:text-base">
            Trusted by students applying to{" "}
            <span className="font-medium text-foreground">
              Oxford, IIT, Warwick, NUS, UCL
            </span>{" "}
            and more
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {unis.map((u) => (
              <span
                key={u}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-foreground"
              >
                {u}
              </span>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
