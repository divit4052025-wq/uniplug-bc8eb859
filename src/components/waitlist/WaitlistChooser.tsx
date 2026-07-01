import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";

import { M, ArrowRight, ArrowLeft, LogoPill } from "./shared";

/**
 * WaitlistChooser — CD screen B. Two doors: student → /waitlist/student, mentor
 * → /waitlist/mentor. The doors are real links (work with JS off; the gate
 * allows both routes).
 */
const doorGlow = (bg: string): CSSProperties => ({
  position: "absolute",
  top: -40,
  right: -10,
  width: 210,
  height: 230,
  borderRadius: "120px 120px 20px 20px",
  background: bg,
  pointerEvents: "none",
});
const doorH3: CSSProperties = {
  fontFamily: "'Gabarito', sans-serif",
  fontWeight: 800,
  fontSize: "clamp(24px,2.4vw,30px)",
  letterSpacing: "-.02em",
  margin: "auto 0 12px",
  maxWidth: 230,
  lineHeight: 1.08,
  color: "var(--ink)",
};
const doorP: CSSProperties = {
  margin: "0 0 22px",
  fontSize: 15,
  lineHeight: 1.5,
  color: "var(--ink-soft)",
  maxWidth: 300,
};

export function WaitlistChooser() {
  return (
    <div className="uc-waitlist">
      <section
        data-screen-label="Role chooser"
        style={{
          position: "relative",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--paper)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "-14%",
            left: "8%",
            width: "min(520px,52vw)",
            height: "min(520px,52vw)",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(244,181,170,.34), transparent 66%)",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: "-16%",
            right: "6%",
            width: "min(520px,52vw)",
            height: "min(520px,52vw)",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(242,208,152,.34), transparent 66%)",
            pointerEvents: "none",
          }}
        />

        <header
          style={{
            position: "relative",
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "22px clamp(18px,4vw,56px)",
            maxWidth: 1320,
            width: "100%",
            margin: "0 auto",
          }}
        >
          <LogoPill />
          <Link to="/" className="up-link" style={{ fontSize: 14 }}>
            <ArrowLeft size={17} />
            Back
          </Link>
        </header>

        <div
          style={{
            position: "relative",
            zIndex: 2,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            padding: "clamp(16px,3vh,40px) clamp(20px,4vw,56px) clamp(40px,6vh,72px)",
            maxWidth: 1040,
            width: "100%",
            margin: "0 auto",
          }}
        >
          <span className="up-kicker" style={{ justifyContent: "center" }}>
            Join the waitlist
          </span>
          <h2
            style={{
              fontFamily: "'Gabarito', sans-serif",
              fontWeight: 800,
              letterSpacing: "-.025em",
              lineHeight: 1.03,
              fontSize: "clamp(34px,5vw,58px)",
              margin: "18px 0 14px",
              color: "var(--ink)",
            }}
          >
            Two sides. One Plug.
          </h2>
          <p
            style={{
              margin: "0 0 clamp(30px,4vh,48px)",
              fontSize: "clamp(15px,1.5vw,18px)",
              color: "var(--ink-soft)",
              maxWidth: 520,
              lineHeight: 1.5,
            }}
          >
            Tell us where you’re starting from, and we’ll save your place in line.
          </p>

          <div
            style={{
              display: "flex",
              gap: "clamp(18px,2.5vw,28px)",
              flexWrap: "wrap",
              width: "100%",
              justifyContent: "center",
            }}
          >
            {/* Door: student */}
            <Link
              to="/waitlist/student"
              className="uc-door"
              style={{ background: "linear-gradient(160deg, var(--cream), var(--offwhite) 70%)" }}
            >
              <div
                aria-hidden="true"
                style={doorGlow(
                  "radial-gradient(circle at 50% 40%, rgba(244,181,170,.5), rgba(244,181,170,.16) 60%, transparent 72%)",
                )}
              />
              <M
                shape="sprout"
                expression="happy"
                size={112}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 18,
                  filter: "drop-shadow(0 12px 18px rgba(26,26,26,.12))",
                }}
              />
              <span className="up-kicker" style={{ fontSize: 11 }}>
                School student · Grades 9–12
              </span>
              <h3 style={doorH3}>I’m looking for a Plug.</h3>
              <p style={doorP}>Find a mentor who just did it. Book 1:1 sessions the day we open.</p>
              <span className="up-link" style={{ fontSize: 15, pointerEvents: "none" }}>
                Join as a student
                <ArrowRight size={17} />
              </span>
            </Link>

            {/* Door: mentor */}
            <Link
              to="/waitlist/mentor"
              className="uc-door"
              style={{ background: "linear-gradient(160deg, var(--blush), var(--cream) 82%)" }}
            >
              <div
                aria-hidden="true"
                style={doorGlow(
                  "radial-gradient(circle at 50% 40%, rgba(215,162,72,.42), rgba(215,162,72,.14) 60%, transparent 72%)",
                )}
              />
              <M
                shape="mentor"
                expression="guiding"
                size={118}
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  filter: "drop-shadow(0 12px 18px rgba(26,26,26,.12))",
                }}
              />
              <span className="up-kicker" style={{ fontSize: 11 }}>
                College student
              </span>
              <h3 style={doorH3}>I want to be the Plug.</h3>
              <p style={doorP}>Mentor the juniors coming up behind you. Earn on your terms.</p>
              <span className="up-link" style={{ fontSize: 15, pointerEvents: "none" }}>
                Join as a mentor
                <ArrowRight size={17} />
              </span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
