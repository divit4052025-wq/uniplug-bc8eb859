import { Link } from "@tanstack/react-router";

/**
 * Phase H4 (2026-05-24): brand-styled 404. Wire into the root route's
 * notFoundComponent slot so any unknown URL renders this rather than
 * TanStack Router's default text fallback.
 *
 * Uses brand tokens from src/styles.css @theme — no hex literals.
 */
export function NotFound() {
  return (
    <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-[120px] font-bold leading-none text-brand-brown">404</p>
      <h1 className="mt-4 font-display text-[24px] font-semibold text-brand-dark">
        That page isn't here
      </h1>
      <p className="mt-3 max-w-md text-[14px] font-light text-brand-dark/70">
        The link might be broken or the page may have moved. Try the home page or browse mentors to
        keep going.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-brand-dark px-6 text-[13px] font-medium text-brand-cream transition hover:opacity-90"
        >
          Home
        </Link>
        <Link
          to="/how-it-works"
          className="inline-flex h-11 items-center justify-center rounded-full border border-brand-brown px-6 text-[13px] font-medium text-brand-dark transition hover:bg-brand-blush"
        >
          How it works
        </Link>
      </div>
    </div>
  );
}
