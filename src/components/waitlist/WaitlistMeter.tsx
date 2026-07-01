import { useEffect, useState, type CSSProperties } from "react";

import { fetchWaitlistCounts, type WaitlistCounts } from "@/lib/waitlist/client";
import { M } from "./shared";

/**
 * WaitlistMeter — the live, HONEST tally. Numbers come only from D1
 * (/api/public/waitlist/counts): nothing is seeded, padded, or invented, and a
 * side with no signups shows 0. Re-fetches whenever `refreshKey` changes (the
 * form bumps it after a successful join, so the visitor sees their own signup).
 *
 * The note adapts to the real data: CD's "right now that's zero" empty-state
 * copy shows ONLY while the count is genuinely zero — once anyone has joined,
 * claiming zero would be false, so an honest live line replaces it.
 */
type Tone = "mentee" | "mentor";

const cardStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "12px 14px",
  borderRadius: 8,
  background: "var(--paper)",
};
const numStyle: CSSProperties = {
  fontFamily: "'Gabarito', sans-serif",
  fontWeight: 800,
  fontSize: 26,
  lineHeight: 1,
  color: "var(--ink)",
};
const labelStyle: CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-faint)",
  marginTop: 3,
};

function CountCard({ side, value }: { side: "school" | "college"; value: number | null }) {
  const isSchool = side === "school";
  return (
    <div style={cardStyle}>
      <M
        shape={isSchool ? "sprout" : "mentor"}
        expression={isSchool ? "happy" : "guiding"}
        size={34}
        style={{ flex: "none" }}
      />
      <div>
        <div style={numStyle}>{value == null ? "—" : value}</div>
        <div style={labelStyle}>{isSchool ? "school students" : "college mentors"}</div>
      </div>
    </div>
  );
}

export function WaitlistMeter({
  tone,
  order = "school-first",
  refreshKey = 0,
}: {
  tone: Tone;
  order?: "school-first" | "college-first";
  refreshKey?: number;
}) {
  const [counts, setCounts] = useState<WaitlistCounts | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchWaitlistCounts(ac.signal)
      .then((c) => setCounts(c))
      .catch(() => {
        /* leave placeholders; never fabricate a number */
      });
    return () => ac.abort();
  }, [refreshKey]);

  const total = counts ? counts.school + counts.college : null;
  const note =
    total == null
      ? "Real numbers, live from our waitlist."
      : total === 0
        ? tone === "mentee"
          ? "Real numbers, and right now that’s zero. The first name on the list could be yours."
          : "Real numbers, and right now that’s zero. Be the founding mentor everyone else joins after."
        : tone === "mentee"
          ? "Real numbers, live from our waitlist. Add yours and move up the line."
          : "Real numbers, live from our waitlist. Be the mentor these students are waiting for.";

  const cards =
    order === "school-first" ? (["school", "college"] as const) : (["college", "school"] as const);

  return (
    <div
      style={{
        marginTop: 26,
        border: "1px solid var(--rule)",
        borderRadius: 10,
        background: "var(--offwhite)",
        boxShadow: "var(--shadow-card)",
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span className="up-kicker" style={{ fontSize: 10.5, margin: 0 }}>
          The waitlist so far
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            color: "var(--ink-faint)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "#4F9D6B",
              boxShadow: "0 0 0 3px rgba(79,157,107,.2)",
            }}
          />
          Live
        </span>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {cards.map((side) => (
          <CountCard key={side} side={side} value={counts ? counts[side] : null} />
        ))}
      </div>
      <p
        style={{ margin: "13px 2px 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-soft)" }}
      >
        {note}
      </p>
    </div>
  );
}
