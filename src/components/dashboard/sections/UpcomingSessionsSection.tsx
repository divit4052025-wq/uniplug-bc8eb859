export function UpcomingSessionsSection() {
  return (
    <section id="section-sessions" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Upcoming Sessions</h2>
      <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] px-6 py-10 text-center">
        <p className="text-[15px] font-light text-[#1A1A1A]">
          No upcoming sessions — book one now
        </p>
        <a
          href="/browse"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90"
        >
          Find a Plug
        </a>
      </div>
    </section>
  );
}
