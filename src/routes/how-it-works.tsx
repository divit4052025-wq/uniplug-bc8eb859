import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How It Works — UniPlug" },
      { name: "description", content: "Learn how UniPlug works — browse mentors, book a session, and level up your application." },
    ],
  }),
  component: HowItWorksPage,
});

const steps = [
  {
    n: "01",
    title: "Browse Plugs",
    body: "Find a university student who has been exactly where you want to go. Filter by university, country, and subject.",
  },
  {
    n: "02",
    title: "Book a Session",
    body: "Pick a time, pay securely, and get a private video call link sent straight to your inbox.",
  },
  {
    n: "03",
    title: "Level Up",
    body: "Real talk, real notes, real results. Your next move starts here.",
  },
];

function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-24 md:px-10">
        <p className="text-[12px] font-medium uppercase tracking-widest text-[#C4907F]">How It Works</p>
        <h1 className="mt-3 font-display text-[40px] font-bold leading-tight text-[#1A1A1A] md:text-[56px]">
          Three steps to your dream uni
        </h1>
        <div className="mt-16 grid gap-12 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <div
                className="font-display font-bold text-[#E8C4B8]"
                style={{ fontSize: "80px", lineHeight: 1 }}
              >
                {s.n}
              </div>
              <h2 className="mt-4 font-display text-[24px] font-semibold text-[#1A1A1A]">{s.title}</h2>
              <p className="mt-3 text-[15px] font-light leading-relaxed text-[#1A1A1A]/70">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-16">
          <Link
            to="/student-signup"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[#C4907F] px-8 text-[14px] font-medium text-white transition hover:opacity-90"
          >
            Get Started
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
