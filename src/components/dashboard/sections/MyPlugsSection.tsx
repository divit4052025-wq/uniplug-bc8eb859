export function MyPlugsSection() {
  return (
    <section id="section-plugs" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">My Plugs</h2>
      <div className="mt-4 rounded-2xl bg-[#EDE0DB] px-6 py-10 text-center">
        <p className="text-[15px] font-light text-[#1A1A1A]">
          You haven't found your Plug yet
        </p>
        <a
          href="/browse"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90"
        >
          Find Your Plug
        </a>
      </div>
    </section>
  );
}
