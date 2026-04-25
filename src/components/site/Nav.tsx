import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-background/85 backdrop-blur-md transition-all ${
        scrolled ? "border-b border-border/60 shadow-card" : ""
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="flex items-center" aria-label="UniPlug home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/student-signup"
            className="rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition hover:opacity-90 hover:-translate-y-0.5 sm:px-6 sm:text-sm"
          >
            Find Your Plug
          </Link>
          <Link
            to="/mentor-signup"
            className="rounded-full border border-foreground px-4 py-2.5 text-xs font-semibold text-foreground transition hover:bg-foreground hover:text-background sm:px-6 sm:text-sm"
          >
            Become a Plug
          </Link>
        </nav>
      </div>
    </header>
  );
}
