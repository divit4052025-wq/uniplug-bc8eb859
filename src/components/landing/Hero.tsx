import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";

import { Mascot } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { Magnetic } from "./Magnetic";

const delay = (s: string): CSSProperties => ({ ["--reveal-delay" as string]: s });

/**
 * Hero — kicker, the three-line headline, the editorial gloss line, and the two
 * CTAs (primary → student signup, text link → mentor signup). The Founder is the
 * anchor character in a soft rose halo, with Sprout peeking from the left and
 * Spark from the right. Reveal-on-load via the `data-reveal` attributes the
 * useRevealRoot hook drives.
 */
export function Hero() {
  return (
    <section className="hero wrap" aria-label="UniPlug">
      <div className="hero-grid">
        <div className="hero-copy">
          <span className="kicker" data-reveal="up">
            <span className="dot" aria-hidden="true" />
            Plug into your future
          </span>

          <h1 className="lp-display">
            <span className="line" data-reveal="up" style={delay("0s")}>
              Talk to someone
            </span>
            <span className="line" data-reveal="up" style={delay("0.08s")}>
              who&rsquo;s already
            </span>
            <span className="line" data-reveal="up" style={delay("0.16s")}>
              there.
            </span>
          </h1>

          <div className="gloss" data-reveal="up" style={delay("0.22s")}>
            <span className="bar" aria-hidden="true" />
            <p>
              <b>Plug</b> &mdash; your word for the person who&rsquo;s been there.
            </p>
          </div>

          <div className="hero-ctas" data-reveal="up" style={delay("0.3s")}>
            <Magnetic>
              <Link to="/student-signup" className="btn btn-primary">
                Find your Plug{" "}
                <span className="arr" aria-hidden="true">
                  →
                </span>
              </Link>
            </Magnetic>
            <Magnetic>
              <Link to="/mentor-signup" className="link-cta">
                Become the Plug you needed{" "}
                <span className="arr" aria-hidden="true">
                  →
                </span>
              </Link>
            </Magnetic>
          </div>
        </div>

        <div className="hero-art">
          <div className="hero-halo" data-reveal="scale" aria-hidden="true" />
          <div className="hero-founder" data-reveal="scale">
            <Mascot
              shape="founder"
              color={MASCOTS.founder.color}
              expression="default"
              size={300}
              title="The Founder — the voice of UniPlug"
            />
          </div>
          <div className="hero-peek peek-sprout" data-reveal="left" aria-hidden="true">
            <Mascot
              shape="sprout"
              color={MASCOTS.sprout.color}
              expression="happy"
              size={120}
              decorative
            />
          </div>
          <div className="hero-peek peek-spark" data-reveal="right" aria-hidden="true">
            <Mascot
              shape="spark"
              color={MASCOTS.spark.color}
              expression="focused"
              size={112}
              decorative
            />
          </div>
        </div>
      </div>
    </section>
  );
}
