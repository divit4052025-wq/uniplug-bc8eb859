import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import type { MascotShape, MascotExpression } from "@/components/mascots/Mascot";
import { isValidEmail } from "@/lib/waitlist/validate";
import type { WaitlistKind } from "@/lib/waitlist/validate";
import { submitWaitlist, positionLabel } from "@/lib/waitlist/client";
import { WaitlistHero3D } from "./WaitlistHero3D";
import { WaitlistMeter } from "./WaitlistMeter";
import { PrivacyNoteModal } from "./PrivacyNoteModal";
import { M, ArrowLeft, ArrowRight, LogoPill } from "./shared";
import type { HeroWorldName } from "./hero-sky";

interface Benefit {
  shape: MascotShape;
  expression: MascotExpression;
  strong: string;
  rest: string;
}
interface WorldMascot {
  shape: MascotShape;
  expression: MascotExpression;
  size: number;
  label: string;
}

export interface RoleConfig {
  kind: WaitlistKind;
  tone: "mentee" | "mentor";
  world: HeroWorldName;
  sectionBg: string;
  contentBg: string;
  worldOrder: number;
  contentOrder: number;
  scrim: string;
  worldMascots: WorldMascot[];
  worldMascotGap: number;
  worldKicker: string;
  worldKickerColor: string;
  worldHeadline: ReactNode;
  worldHeadlineMaxCh: number;
  formHeadline: string;
  benefits: Benefit[];
  meterOrder: "school-first" | "college-first";
  emailPlaceholder: string;
  successMascot: { shape: MascotShape; size: number };
  successGlow: string;
  successBody: string;
  successBadgeDot: string;
  successBadgeShadow: string;
  successBadgeLabel: string; // e.g. "Founding student"
  successAltLabel: string;
  successAltTo: string;
}

const displayH3: CSSProperties = {
  fontFamily: "'Gabarito', sans-serif",
  fontWeight: 800,
  letterSpacing: "-.02em",
  fontSize: "clamp(28px,3vw,38px)",
  lineHeight: 1.05,
  color: "var(--ink)",
};

export function WaitlistRolePage({ config }: { config: RoleConfig }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errName, setErrName] = useState(false);
  const [errEmail, setErrEmail] = useState(false);
  const [position, setPosition] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const locked = status === "submitting" || status === "success";

  function editField(setter: (v: string) => void, clearErr: () => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      clearErr();
      if (status === "error") setStatus("idle");
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nm = name.trim();
    const em = email.trim();
    const eName = nm.length === 0;
    const eEmail = !isValidEmail(em);
    if (eName || eEmail) {
      setErrName(eName);
      setErrEmail(eEmail);
      setStatus("idle");
      return;
    }
    setStatus("submitting");
    setErrName(false);
    setErrEmail(false);
    try {
      const res = await submitWaitlist({ name: nm, email: em, kind: config.kind });
      setPosition(res.position);
      setStatus("success");
      setRefreshKey((k) => k + 1); // re-fetch the meter so the visitor sees their own join
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="uc-waitlist">
      <section
        className="uc-role-section"
        data-screen-label={config.tone === "mentee" ? "Mentee waitlist" : "Mentor waitlist"}
        style={{ background: config.sectionBg }}
      >
        {/* ---- world ---- */}
        <div className="uc-role-world" style={{ order: config.worldOrder }}>
          <WaitlistHero3D world={config.world} />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: config.scrim,
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "absolute",
              top: 22,
              left: 0,
              right: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 clamp(18px,3vw,34px)",
              zIndex: 3,
            }}
          >
            <LogoPill size={22} fontSize={15} gap={9} />
            <Link
              to="/waitlist"
              className="up-btn up-btn--primary on-dark up-btn--sm"
              style={{ borderRadius: 999, backdropFilter: "blur(6px)" }}
            >
              <ArrowLeft size={15} />
              Change path
            </Link>
          </div>

          <div
            className="on-dark"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "0 clamp(20px,3.4vw,44px) clamp(26px,4vh,44px)",
              zIndex: 3,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: config.worldMascotGap,
                alignItems: "flex-end",
                marginBottom: 18,
              }}
            >
              {config.worldMascots.map((wm) => (
                <div key={wm.label} style={{ textAlign: "center" }}>
                  <M shape={wm.shape} expression={wm.expression} size={wm.size} />
                  <div
                    style={{
                      fontFamily: "'Quicksand', sans-serif",
                      fontWeight: 600,
                      fontSize: 10.5,
                      letterSpacing: ".06em",
                      color: "var(--paper)",
                      opacity: 0.82,
                      marginTop: 2,
                    }}
                  >
                    {wm.label}
                  </div>
                </div>
              ))}
            </div>
            <span
              className="up-kicker"
              style={{ color: config.worldKickerColor, marginBottom: 12 }}
            >
              {config.worldKicker}
            </span>
            <h2
              style={{
                fontFamily: "'Gabarito', sans-serif",
                fontWeight: 800,
                letterSpacing: "-.02em",
                lineHeight: 1.05,
                fontSize: "clamp(26px,3vw,42px)",
                margin: 0,
                color: "var(--paper)",
                maxWidth: `${config.worldHeadlineMaxCh}ch`,
                textShadow: "0 2px 20px rgba(23,21,19,.4)",
              }}
            >
              {config.worldHeadline}
            </h2>
          </div>
        </div>

        {/* ---- content ---- */}
        <div
          className="uc-role-content"
          style={{ background: config.contentBg, order: config.contentOrder }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "auto",
              paddingBlock: "clamp(34px,5vh,64px)",
            }}
          >
            {status !== "success" ? (
              <div>
                <span className="up-kicker">Join the waitlist</span>
                <h3 style={{ ...displayH3, margin: "14px 0 24px" }}>{config.formHeadline}</h3>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 15, marginBottom: 28 }}
                >
                  {config.benefits.map((b) => (
                    <div
                      key={b.strong}
                      style={{ display: "flex", gap: 13, alignItems: "flex-start" }}
                    >
                      <M
                        shape={b.shape}
                        expression={b.expression}
                        size={40}
                        style={{ flex: "none", marginTop: -2 }}
                      />
                      <p
                        style={{
                          margin: 0,
                          fontSize: 15,
                          lineHeight: 1.5,
                          color: "var(--ink-soft)",
                        }}
                      >
                        <b style={{ color: "var(--ink)" }}>{b.strong}</b> {b.rest}
                      </p>
                    </div>
                  ))}
                </div>

                {status === "error" && (
                  <div
                    className="up-alert up-alert--danger uc-anim-pop"
                    role="alert"
                    style={{ marginBottom: 16 }}
                  >
                    <svg
                      className="up-alert-icon"
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ color: "var(--danger)" }}
                      aria-hidden="true"
                    >
                      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2} />
                      <path
                        d="M12 7.5v5M12 16h.01"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div style={{ fontSize: 14, lineHeight: 1.45, color: "var(--ink)" }}>
                      <b>That didn’t go through.</b> Your details are safe and nothing was sent.
                      Please try again.
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleSubmit}
                  style={{ display: "flex", flexDirection: "column", gap: 16 }}
                >
                  <div className="up-field">
                    <label className="up-label" htmlFor={`${config.kind}-name`}>
                      Name
                    </label>
                    <input
                      id={`${config.kind}-name`}
                      className="up-input"
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={editField(setName, () => setErrName(false))}
                      disabled={locked}
                      aria-invalid={errName || undefined}
                      autoComplete="name"
                    />
                    {errName && <span className="up-error">Enter your name.</span>}
                  </div>
                  <div className="up-field">
                    <label className="up-label" htmlFor={`${config.kind}-email`}>
                      Email
                    </label>
                    <input
                      id={`${config.kind}-email`}
                      className="up-input"
                      type="email"
                      placeholder={config.emailPlaceholder}
                      value={email}
                      onChange={editField(setEmail, () => setErrEmail(false))}
                      disabled={locked}
                      aria-invalid={errEmail || undefined}
                      autoComplete="email"
                    />
                    {errEmail && <span className="up-error">Enter a valid email.</span>}
                  </div>

                  <button
                    type="submit"
                    className="up-btn up-btn--primary up-btn--lg up-btn--block"
                    disabled={status === "submitting"}
                    style={{ marginTop: 4 }}
                  >
                    {status === "submitting" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <span aria-hidden="true" className="uc-spinner" />
                        Joining the list…
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        Join the waitlist
                        <ArrowRight size={18} />
                      </span>
                    )}
                  </button>

                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: "var(--ink-faint)",
                    }}
                  >
                    By joining you agree to be contacted about UniPlug’s launch.{" "}
                    <button
                      type="button"
                      className="up-link"
                      onClick={() => setPrivacyOpen(true)}
                      style={{ fontSize: 12.5, fontWeight: 700, verticalAlign: "baseline" }}
                    >
                      Privacy note
                    </button>
                  </p>
                </form>

                <WaitlistMeter
                  tone={config.tone}
                  order={config.meterOrder}
                  refreshKey={refreshKey}
                />
              </div>
            ) : (
              <div className="uc-anim-success" style={{ textAlign: "center" }}>
                <div style={{ position: "relative", display: "inline-block", marginBottom: 6 }}>
                  <div
                    aria-hidden="true"
                    className="uc-glow"
                    style={{
                      position: "absolute",
                      inset: -18,
                      borderRadius: "50%",
                      background: config.successGlow,
                    }}
                  />
                  <M
                    shape={config.successMascot.shape}
                    expression="celebrating"
                    size={config.successMascot.size}
                    style={{ position: "relative" }}
                  />
                </div>
                <span className="up-kicker" style={{ justifyContent: "center" }}>
                  You’re on the list
                </span>
                <h3 style={{ ...displayH3, margin: "14px 0 12px" }}>Your place is saved.</h3>
                <p
                  style={{
                    margin: "0 auto 22px",
                    maxWidth: 350,
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: "var(--ink-soft)",
                  }}
                >
                  {config.successBody}
                </p>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 20px",
                    borderRadius: 999,
                    background: "var(--night)",
                    color: "var(--paper)",
                    marginBottom: 26,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: config.successBadgeDot,
                      boxShadow: config.successBadgeShadow,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Quicksand', sans-serif",
                      fontWeight: 600,
                      fontSize: 13.5,
                    }}
                  >
                    {config.successBadgeLabel} · {positionLabel(position)}
                  </span>
                </div>
                <div
                  style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}
                >
                  <Link to="/" className="up-btn up-btn--outline">
                    Back to home
                  </Link>
                  <Link to={config.successAltTo} className="up-btn up-btn--ghost">
                    {config.successAltLabel}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <PrivacyNoteModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
}
