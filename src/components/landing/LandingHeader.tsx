import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import umarkPaper from "@/assets/landing/umark-paper.png";
import { Magnetic } from "./Magnetic";

/**
 * The floating pill header — three separate rounded pills (the one rounded
 * exception in the squared design): the U. mark (left, scrolls to top), the
 * action pill (centre/right, the two CTAs), and a Menu toggle that opens a
 * full-screen sheet on mobile. The CTAs route to the real signup entry points
 * (/student-signup, /mentor-signup). SSR-safe: the scroll listener is in an
 * effect; with JS off the header renders fully and the links still work.
 */
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the mobile sheet is open: lock body scroll, move focus into the sheet,
  // close on Escape, and restore focus to the toggle on close.
  useEffect(() => {
    if (!menuOpen) return;
    const toggle = toggleRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      toggle?.focus();
    };
  }, [menuOpen]);

  return (
    <>
      <header className={`float-header${scrolled ? " scrolled" : ""}`}>
        <a className="pill pill-logo" href="#welcome-top" aria-label="UniPlug home">
          <img src={umarkPaper} alt="UniPlug" />
        </a>

        <div className="pill pill-actions">
          <Magnetic>
            <Link to="/mentor-signup" className="hbtn hbtn-ghost">
              Become the Plug you needed{" "}
              <span className="arr" aria-hidden="true">
                →
              </span>
            </Link>
          </Magnetic>
          <Magnetic>
            <Link to="/student-signup" className="hbtn hbtn-solid">
              Find your Plug{" "}
              <span className="arr" aria-hidden="true">
                →
              </span>
            </Link>
          </Magnetic>
        </div>

        <button
          type="button"
          ref={toggleRef}
          className="pill menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="welcome-nav-sheet"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </header>

      <div
        id="welcome-nav-sheet"
        className={`nav-sheet${menuOpen ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <button
          type="button"
          ref={closeRef}
          className="nav-sheet-close"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        >
          Close
        </button>
        <Link to="/student-signup" onClick={() => setMenuOpen(false)}>
          Find your Plug{" "}
          <span className="arr" aria-hidden="true">
            →
          </span>
        </Link>
        <Link to="/mentor-signup" onClick={() => setMenuOpen(false)}>
          Become the Plug you needed{" "}
          <span className="arr" aria-hidden="true">
            →
          </span>
        </Link>
      </div>
    </>
  );
}
