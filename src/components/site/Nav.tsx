import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b border-[#EDE0DB] transition-all ${
        scrolled ? "bg-[#FFFCFB]/80 backdrop-blur-md" : "bg-[#FFFCFB]"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">
        <Link to="/" aria-label="UniPlug home" className="flex items-center">
          <Logo variant="wordmark-dark" className="h-10 w-auto" />
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-full px-4 text-[13px] font-medium text-[#1A1A1A] transition hover:text-[#C4907F]"
          >
            Log in
          </Link>
          <Link
            to="/student-signup"
            className="inline-flex h-10 items-center rounded-full bg-[#C4907F] px-5 text-[13px] font-medium text-white transition hover:opacity-90"
          >
            Find Your Plug
          </Link>
          <Link
            to="/mentor-signup"
            className="inline-flex h-10 items-center rounded-full border border-[#1A1A1A] px-5 text-[13px] font-medium text-[#1A1A1A] transition hover:bg-[#1A1A1A] hover:text-white"
          >
            Become a Plug
          </Link>
        </nav>
      </div>
    </header>
  );
}
