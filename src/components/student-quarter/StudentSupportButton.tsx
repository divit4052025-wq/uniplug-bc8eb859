import { useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { LifeBuoy, Phone, ShieldAlert, X } from "lucide-react";

import "./quarter.css";

/**
 * StudentSupportButton — a PERSISTENT, hovering emergency-guidance affordance for
 * the student Quarter. NOT a 3D-world building, NOT a route/zone: it is mounted
 * once in the dashboard layout (alongside the <Outlet/>) so it floats over every
 * landmark AND the full-screen WebGL world home at /dashboard.
 *
 * OWNER DECISION (overrides the original brief): this is EMERGENCY GUIDANCE ONLY.
 * There is deliberately NO report-submission form, NO free-text box, NO submit,
 * and NO claim of review/monitoring. The hard safeguarding gate (a monitored
 * inbox + lawyer-confirmed POCSO escalation + an adversarial child-safety review)
 * is not yet met, and soliciting a minor's abuse disclosure into an unmonitored
 * channel would be worse than nothing. The full report intake stays deferred
 * until those three conditions exist. This surface only points a student in
 * danger to the real, staffed emergency lines — honestly.
 *
 * THREE-FREE: pure React + CSS (Radix Dialog + lucide + the locked Quarter
 * tokens in ./quarter.css). It imports nothing from the world scene engine and
 * never pulls three, so it is safe in the eager SSR/Worker path that mounts the
 * dashboard layout. Accessibility (focus trap, Esc-to-close, focus return to the
 * trigger, role="dialog" + aria-modal + an accessible name) is provided by the
 * project's existing Radix Dialog primitive, styled here with Quarter tokens
 * only (no old/global tokens, no mentor-Embassy inline hex).
 */
export function StudentSupportButton() {
  // The world home (/dashboard exactly) owns the bottom-right corner with its
  // zone dock; lift the button above it there. Every interior landmark route
  // leaves the corner free, so it sits at the corner everywhere else.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onWorldHome = pathname === "/dashboard" || pathname === "/dashboard/";

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="qbtn qbtn-cta"
          style={{
            position: "fixed",
            right: 20,
            bottom: onWorldHome ? 116 : 22,
            // Above the full-screen WebGL canvas + HUD/dock (z 4–6) and the rooms
            // (z 20). Transient dev/notification panels (z 60–71) may cover it;
            // the dialog itself opens far above everything (z 100+).
            zIndex: 50,
            boxShadow: "0 12px 30px -10px rgba(26,26,26,.5)",
            fontFamily: "var(--q-disp)",
          }}
          aria-haspopup="dialog"
        >
          <LifeBuoy size={16} strokeWidth={2.2} aria-hidden="true" />
          Need help now?
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,26,26,.45)",
            backdropFilter: "blur(3px)",
            zIndex: 100,
          }}
        />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          className="qc"
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(440px, 94vw)",
            maxHeight: "90vh",
            overflowY: "auto",
            zIndex: 101,
            // The dialog portals to <body>, outside .qx-stage/.qsec, so set the
            // Quarter body font explicitly (the --q-* tokens are global on :root).
            fontFamily: "var(--q-body)",
            color: "var(--q-ink)",
            boxShadow: "0 30px 80px -30px rgba(26,26,26,.6)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "var(--q-rose-soft)",
                display: "grid",
                placeContent: "center",
                flex: "none",
              }}
            >
              <ShieldAlert size={20} style={{ color: "var(--q-deep)" }} aria-hidden="true" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Dialog.Title
                style={{
                  fontFamily: "var(--q-disp)",
                  fontWeight: 800,
                  fontSize: 21,
                  letterSpacing: "-.02em",
                  lineHeight: 1.1,
                  color: "var(--q-ink)",
                  margin: 0,
                }}
              >
                Need help right now?
              </Dialog.Title>
              <Dialog.Description
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "var(--q-ink70)",
                  margin: "7px 0 0",
                }}
              >
                If you're in danger or need help right now, contact these directly. UniPlug is not
                an emergency service, and this isn't a monitored channel.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                style={{
                  flex: "none",
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: 0,
                  background: "transparent",
                  color: "var(--q-ink55)",
                  cursor: "pointer",
                  display: "grid",
                  placeContent: "center",
                }}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          {/* Emergency lines FIRST — the real, staffed numbers. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            <a
              href="tel:1098"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "14px 15px",
                borderRadius: 16,
                border: "1px solid var(--q-line)",
                background: "var(--q-soft)",
                textDecoration: "none",
                color: "var(--q-ink)",
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--q-paper)",
                  border: "1px solid var(--q-line)",
                  display: "grid",
                  placeContent: "center",
                  flex: "none",
                }}
              >
                <Phone size={18} style={{ color: "var(--q-cta)" }} aria-hidden="true" />
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--q-disp)",
                    fontWeight: 800,
                    fontSize: 18,
                    lineHeight: 1.1,
                    color: "var(--q-ink)",
                  }}
                >
                  Call Childline 1098
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: "var(--q-ink55)",
                    marginTop: 3,
                  }}
                >
                  India's 24/7 free helpline for children in need of care and protection.
                </span>
              </span>
            </a>

            <a
              href="tel:112"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "14px 15px",
                borderRadius: 16,
                border: "1px solid var(--q-line)",
                background: "var(--q-soft)",
                textDecoration: "none",
                color: "var(--q-ink)",
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--q-paper)",
                  border: "1px solid var(--q-line)",
                  display: "grid",
                  placeContent: "center",
                  flex: "none",
                }}
              >
                <Phone size={18} style={{ color: "var(--q-coral)" }} aria-hidden="true" />
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--q-disp)",
                    fontWeight: 800,
                    fontSize: 18,
                    lineHeight: 1.1,
                    color: "var(--q-ink)",
                  }}
                >
                  Call 112
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: "var(--q-ink55)",
                    marginTop: 3,
                  }}
                >
                  India's national emergency number — police, fire, and ambulance.
                </span>
              </span>
            </a>
          </div>

          <p
            style={{
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--q-ink70)",
              margin: "14px 0 0",
            }}
          >
            You can also tell a trusted adult — a parent, teacher, or school counsellor. You don't
            have to handle this alone.
          </p>

          <Dialog.Close asChild>
            <button type="button" className="qbtn qbtn-ghost qbtn-block" style={{ marginTop: 18 }}>
              Close
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
