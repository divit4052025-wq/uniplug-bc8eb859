import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";

import { Mascot } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { Magnetic } from "./Magnetic";
import { usePinnedScroll } from "./usePinnedScroll";

/** pinned-child stagger (CSS var `--d`) */
const d = (s: string): CSSProperties => ({ ["--d" as string]: s });

/**
 * The pinned scroll sequence. While the sticky stage is pinned, scroll progress
 * advances the active panel; each scene transforms in over the stage while the
 * previous recedes (all in CSS — see usePinnedScroll + welcome.css). Five panels:
 * Founder quote → The Gap → For Students → For Mentors → Closing. With JS off or
 * under reduced motion, `.pin-on` is never added and these render as a plain,
 * fully-readable stacked scroll.
 */
export function PinnedSequence() {
  const wrapRef = usePinnedScroll<HTMLDivElement>();

  return (
    <div className="pin-wrap" ref={wrapRef}>
      <div className="pin-stage">
        {/* 1 — Founder quote */}
        <section className="panel panel-quote on-dark" data-panel="0" aria-label="From the founder">
          <div className="panel-inner">
            <div className="quote-glow anim" aria-hidden="true" />
            <div className="quote-founder anim scale-in">
              <Mascot
                shape="founder"
                color={MASCOTS.founder.color}
                expression="guiding"
                size={132}
                title="The Founder"
              />
            </div>
            <blockquote className="quote-said lp-display anim up">
              &ldquo;Two options. One costs a fortune. One&rsquo;s a thousand strangers.{" "}
              <span className="rose">Neither has done it.</span>&rdquo;
            </blockquote>
            <div className="quote-tag anim up">The Founder</div>
          </div>
        </section>

        {/* 2 — The Gap */}
        <section className="panel panel-gap on-dark" data-panel="1" aria-label="The gap">
          <div className="panel-inner">
            <span className="kicker anim up">The gap</span>
            <h2 className="panel-h lp-display anim up" style={d("0.1s")}>
              Two roads in.
              <br />
              <span className="rose">Then there&rsquo;s yours.</span>
            </h2>
            <div className="gap-cols">
              <div className="gap-col gap-bad anim from-left" style={d("0.16s")}>
                <div className="gc-num">01</div>
                <h3>The counsellor</h3>
                <div className="gc-meta">Costs a fortune</div>
              </div>
              <div className="gap-col gap-bad anim from-bottom" style={d("0.34s")}>
                <div className="gc-num">02</div>
                <h3>The internet</h3>
                <div className="gc-meta">A flood of strangers</div>
              </div>
              <div className="gap-col gap-answer anim from-right" style={d("0.5s")}>
                <div className="gc-num">03</div>
                <h3>Your Plug</h3>
                <div className="gc-meta">Someone who&rsquo;s done it</div>
                <div className="answer-mascot">
                  <Mascot
                    shape="mentor"
                    color={MASCOTS.mentor.color}
                    expression="guiding"
                    size={88}
                    decorative
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3 — For Students (Sprout from left, Climber from right, Spark from bottom) */}
        <section className="panel panel-students" data-panel="2" aria-label="For students">
          <div className="panel-inner">
            <h2 className="stu-title lp-display anim up">
              Wherever you are, there&rsquo;s a Plug a step ahead.
            </h2>
            <div className="stu-row">
              <div className="stu-card anim from-left">
                <div className="stu-disc" style={{ background: "var(--rose)" }}>
                  <Mascot
                    shape="sprout"
                    color={MASCOTS.sprout.color}
                    expression="happy"
                    size={120}
                    decorative
                  />
                </div>
                <div className="sr-stage">Sprout</div>
                <div className="sr-grade">Grade 9&ndash;10</div>
                <div className="sr-head">Just figuring it out.</div>
              </div>

              <div className="stu-card anim from-right" style={d("0.16s")}>
                <div className="stu-disc" style={{ background: "var(--stone)" }}>
                  <Mascot
                    shape="climber"
                    color={MASCOTS.climber.color}
                    expression="thinking"
                    size={120}
                    decorative
                  />
                </div>
                <div className="sr-stage">Climber</div>
                <div className="sr-grade">Grade 11</div>
                <div className="sr-head">Building the plan.</div>
              </div>

              <div className="stu-card anim from-bottom" style={d("0.32s")}>
                <div className="stu-disc" style={{ background: "rgba(237,126,74,0.32)" }}>
                  <Mascot
                    shape="spark"
                    color={MASCOTS.spark.color}
                    expression="focused"
                    size={120}
                    decorative
                  />
                </div>
                <div className="sr-stage">Spark</div>
                <div className="sr-grade">Grade 12</div>
                <div className="sr-head">The final stretch.</div>
              </div>
            </div>
          </div>
        </section>

        {/* 4 — For Mentors (Mentor rises from below) */}
        <section className="panel panel-mentors" data-panel="3" aria-label="For mentors">
          <div className="panel-inner">
            <div className="mentors-art anim from-bottom">
              <div className="ma-halo" aria-hidden="true" />
              <div className="ma-m">
                <Mascot
                  shape="mentor"
                  color={MASCOTS.mentor.color}
                  expression="guiding"
                  size={240}
                  title="The Mentor"
                />
              </div>
            </div>
            <div>
              <span className="kicker anim up">For mentors</span>
              <h2 className="lp-display anim up" style={d("0.1s")}>
                Become the Plug you needed.
              </h2>
              <ul className="mentor-points">
                <li className="anim up" style={d("0.28s")}>
                  <span className="mp-n">01</span>
                  <b>Earn on your terms</b>
                </li>
                <li className="anim up" style={d("0.38s")}>
                  <span className="mp-n">02</span>
                  <b>We handle everything but the talking</b>
                </li>
                <li className="anim up" style={d("0.48s")}>
                  <span className="mp-n">03</span>
                  <b>Reach the juniors who need your road</b>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 5 — Closing */}
        <section
          className="panel panel-closing on-dark"
          data-panel="4"
          aria-label="Plug into your future"
        >
          <div className="panel-inner">
            <div className="c-m anim scale-in">
              <Mascot
                shape="founder"
                color={MASCOTS.founder.color}
                expression="happy"
                size={136}
                title="The Founder"
              />
            </div>
            <h2 className="c-title lp-display anim up" style={d("0.12s")}>
              Plug into
              <br />
              your future
              <span className="c-rose">.</span>
            </h2>
            <div className="c-cta anim up" style={d("0.24s")}>
              <Magnetic>
                <Link to="/student-signup" className="btn btn-primary btn-lg">
                  Find your Plug{" "}
                  <span className="arr" aria-hidden="true">
                    →
                  </span>
                </Link>
              </Magnetic>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
