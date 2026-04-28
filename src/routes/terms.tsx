import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — UniPlug" },
      { name: "description", content: "UniPlug Terms of Service." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-24 md:px-10">
        <p className="text-[12px] font-medium uppercase tracking-widest text-[#C4907F]">Legal</p>
        <h1 className="mt-3 font-display text-[40px] font-bold leading-tight text-[#1A1A1A]">
          Terms of Service
        </h1>
        <p className="mt-8 text-[15px] leading-relaxed text-[#1A1A1A]/70">
          These terms and conditions are being drafted. Please check back soon.
        </p>
      </main>
      <Footer />
    </div>
  );
}
