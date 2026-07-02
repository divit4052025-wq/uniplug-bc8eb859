import { useEffect, type CSSProperties } from "react";

/**
 * PrivacyNoteModal — CD's inline "short version" note. Honest and specific:
 * name + email only, one use, no spam/selling, delete anytime. Contact is
 * privacy@uniplug.app. It deliberately does NOT link to any legal page — the
 * waitlist is self-contained and never pulls in the app's legal routes.
 */
const bullets = [
  <>
    We collect only your <b style={{ color: "var(--ink)" }}>name and email</b>. Nothing else.
  </>,
  <>
    We use it for <b style={{ color: "var(--ink)" }}>one thing</b>: to email you when UniPlug opens.
  </>,
  <>
    No spam, no selling your data. Ask us to delete it anytime at{" "}
    <b style={{ color: "var(--ink)" }}>privacy@uniplug.app</b>.
  </>,
];

const dotStyle: CSSProperties = {
  flex: "none",
  width: 6,
  height: 6,
  borderRadius: 999,
  background: "var(--rose-deep)",
  marginTop: 7,
};

export function PrivacyNoteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(23,21,19,.5)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Privacy note"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420,
          width: "100%",
          background: "var(--offwhite)",
          borderRadius: 18,
          boxShadow: "var(--shadow-pop)",
          padding: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span className="up-kicker" style={{ margin: 0 }}>
            Privacy note
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="up-btn up-btn--ghost up-btn--icon up-btn--sm"
            style={{ borderRadius: 999 }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <h4
          style={{
            fontFamily: "'Gabarito', sans-serif",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "-.02em",
            margin: "0 0 14px",
            color: "var(--ink)",
          }}
        >
          The short version
        </h4>
        <ul
          style={{
            listStyle: "none",
            margin: "0 0 18px",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {bullets.map((b, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                gap: 10,
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--ink-soft)",
              }}
            >
              <span style={dotStyle} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="up-btn up-btn--primary up-btn--block" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
