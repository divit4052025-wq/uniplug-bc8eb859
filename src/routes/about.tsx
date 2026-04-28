import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — UniPlug" },
      { name: "description", content: "Learn about UniPlug and our mission to connect students with university mentors." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-24 md:px-10">
        <p className="text-[12px] font-medium uppercase tracking-widest text-[#C4907F]">About</p>
        <h1 className="mt-3 font-display text-[40px] font-bold leading-tight text-[#1A1A1A] md:text-[56px]">
          Your College Plug
        </h1>
        <p className="mt-6 text-[17px] leading-relaxed text-[#1A1A1A]/70">
          UniPlug connects Indian high schoolers with verified university students for real, 1-on-1 mentorship. No agencies, no fluff — just honest conversations with people who've been exactly where you want to go.
        </p>
        <Link
          to="/browse"
          className="mt-10 inline-flex h-12 items-center justify-center rounded-full bg-[#C4907F] px-8 text-[14px] font-medium text-white transition hover:opacity-90"
        >
          Browse Plugs
        </Link>
      </main>
      <Footer />
    </div>
  );
}
