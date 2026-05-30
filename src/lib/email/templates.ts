// Shared HTML templates for UniPlug booking emails.
// All emails use brand colors: #1A1A1A bg, white text, #C4907F accents.

const BRAND_DARK = "#1A1A1A";
const BRAND_ACCENT = "#C4907F";
const BRAND_LIGHT = "#FFFCFB";
const BRAND_SOFT = "#EDE0DB";

function formatDate(dateISO: string): string {
  try {
    return new Date(`${dateISO}T00:00:00`).toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateISO;
  }
}

function shell(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${BRAND_DARK};font-family:Inter,Arial,sans-serif;color:${BRAND_LIGHT};">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND_DARK};">${opts.preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_DARK};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${BRAND_DARK};">
        <tr><td style="padding:0 8px 28px 8px;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:${BRAND_LIGHT};">UniPlug</p>
        </td></tr>
        <tr><td style="padding:32px 28px;background:#222222;border-radius:18px;">
          <h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:${BRAND_ACCENT};">${opts.heading}</h1>
          <div style="font-size:15px;line-height:1.6;color:${BRAND_LIGHT};">${opts.bodyHtml}</div>
          <div style="margin-top:28px;">
            <a href="${opts.ctaUrl}" style="display:inline-block;background:${BRAND_ACCENT};color:${BRAND_LIGHT};text-decoration:none;font-weight:600;font-size:14px;padding:14px 26px;border-radius:999px;">${opts.ctaLabel}</a>
          </div>
        </td></tr>
        <tr><td style="padding:24px 8px 0 8px;">
          <p style="margin:0;font-size:12px;color:${BRAND_SOFT};opacity:0.7;">UniPlug — mentorship for the next chapter.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function detailsBlock(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:separate;">
    ${rows
      .map(
        ([k, v]) => `<tr>
          <td style="padding:8px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_SOFT};opacity:0.7;width:120px;">${k}</td>
          <td style="padding:8px 0;font-size:15px;color:${BRAND_LIGHT};font-weight:500;">${v}</td>
        </tr>`,
      )
      .join("")}
  </table>`;
}

export function studentBookingConfirmationEmail(p: {
  mentorName: string;
  date: string;
  timeSlot: string;
}) {
  return {
    subject: "Your session is booked — UniPlug",
    html: shell({
      preheader: `Session with ${p.mentorName} confirmed`,
      heading: "Your session is booked",
      bodyHtml: `
        <p style="margin:0;">You're all set. Here are the details of your upcoming mentorship session:</p>
        ${detailsBlock([
          ["Mentor", p.mentorName],
          ["Date", formatDate(p.date)],
          ["Time", p.timeSlot],
          ["Duration", "60 minutes"],
        ])}
        <p style="margin:0;">Your video call link will be sent to you 30 minutes before your session. You can also find it in your dashboard.</p>
      `,
      ctaLabel: "View Dashboard",
      ctaUrl: "https://uniplug.lovable.app/dashboard",
    }),
  };
}

export function mentorBookingAlertEmail(p: {
  studentName: string;
  date: string;
  timeSlot: string;
}) {
  return {
    subject: "New session booked — UniPlug",
    html: shell({
      preheader: `New session with ${p.studentName}`,
      heading: "New session booked",
      bodyHtml: `
        <p style="margin:0;">A student has booked a session with you:</p>
        ${detailsBlock([
          ["Student", p.studentName],
          ["Date", formatDate(p.date)],
          ["Time", p.timeSlot],
        ])}
        <p style="margin:0;">Log into your dashboard to prepare for the session and view the student's profile and documents.</p>
      `,
      ctaLabel: "View Dashboard",
      ctaUrl: "https://uniplug.lovable.app/mentor-dashboard",
    }),
  };
}

export function studentReminderEmail(p: { mentorName: string; date: string; timeSlot: string }) {
  return {
    subject: "Your session is tomorrow — UniPlug",
    html: shell({
      preheader: `Session with ${p.mentorName} tomorrow`,
      heading: "Your session is tomorrow",
      bodyHtml: `
        <p style="margin:0;">A quick reminder about your upcoming session:</p>
        ${detailsBlock([
          ["Mentor", p.mentorName],
          ["Date", formatDate(p.date)],
          ["Time", p.timeSlot],
        ])}
        <p style="margin:0;">Your video call link will be sent 30 minutes before the session. You can also find it in your dashboard.</p>
      `,
      ctaLabel: "View Dashboard",
      ctaUrl: "https://uniplug.lovable.app/dashboard",
    }),
  };
}

export function mentorReminderEmail(p: { studentName: string; date: string; timeSlot: string }) {
  return {
    subject: "You have a session tomorrow — UniPlug",
    html: shell({
      preheader: `Session with ${p.studentName} tomorrow`,
      heading: "You have a session tomorrow",
      bodyHtml: `
        <p style="margin:0;">A quick reminder about your upcoming session:</p>
        ${detailsBlock([
          ["Student", p.studentName],
          ["Date", formatDate(p.date)],
          ["Time", p.timeSlot],
        ])}
        <p style="margin:0;">Log into your dashboard to prepare and review the student's profile.</p>
      `,
      ctaLabel: "View Dashboard",
      ctaUrl: "https://uniplug.lovable.app/mentor-dashboard",
    }),
  };
}

// ─── Phase C2 (2026-05-23): cancellation, completion, review, approval ────

export function studentBookingCancelledEmail(p: {
  mentorName: string;
  date: string;
  timeSlot: string;
}) {
  return {
    subject: "Your session was cancelled — UniPlug",
    html: shell({
      preheader: `Session with ${p.mentorName} was cancelled`,
      heading: "Your session was cancelled",
      bodyHtml: `
        <p style="margin:0;">Your upcoming session has been cancelled:</p>
        ${detailsBlock([
          ["Mentor", p.mentorName],
          ["Date", formatDate(p.date)],
          ["Time", p.timeSlot],
        ])}
        <p style="margin:0;">You can browse and book another mentor any time from your dashboard.</p>
      `,
      ctaLabel: "Browse Mentors",
      ctaUrl: "https://uniplug.lovable.app/browse",
    }),
  };
}

export function mentorBookingCancelledEmail(p: {
  studentName: string;
  date: string;
  timeSlot: string;
}) {
  return {
    subject: "A session was cancelled — UniPlug",
    html: shell({
      preheader: `Session with ${p.studentName} was cancelled`,
      heading: "Session cancelled",
      bodyHtml: `
        <p style="margin:0;">A booked session has been cancelled:</p>
        ${detailsBlock([
          ["Student", p.studentName],
          ["Date", formatDate(p.date)],
          ["Time", p.timeSlot],
        ])}
        <p style="margin:0;">The slot is now free again on your calendar.</p>
      `,
      ctaLabel: "View Schedule",
      ctaUrl: "https://uniplug.lovable.app/mentor-dashboard",
    }),
  };
}

export function studentSessionCompletedEmail(p: {
  mentorName: string;
  date: string;
  timeSlot: string;
  bookingId: string;
}) {
  return {
    subject: "How was your session? — UniPlug",
    html: shell({
      preheader: `Your session with ${p.mentorName} just wrapped`,
      heading: "How was your session?",
      bodyHtml: `
        <p style="margin:0;">Your session with ${p.mentorName} is complete:</p>
        ${detailsBlock([
          ["Mentor", p.mentorName],
          ["Date", formatDate(p.date)],
          ["Time", p.timeSlot],
        ])}
        <p style="margin:0;">Take a minute to leave a review — it helps future students find the right mentor.</p>
      `,
      ctaLabel: "Leave a Review",
      ctaUrl: `https://uniplug.lovable.app/dashboard?review=${p.bookingId}`,
    }),
  };
}

export function mentorSessionCompletedEmail(p: {
  studentName: string;
  date: string;
  timeSlot: string;
  bookingId: string;
}) {
  return {
    subject: "Session complete — add your notes — UniPlug",
    html: shell({
      preheader: `Session with ${p.studentName} just wrapped`,
      heading: "Session complete",
      bodyHtml: `
        <p style="margin:0;">Nice work. Your session with ${p.studentName} just wrapped:</p>
        ${detailsBlock([
          ["Student", p.studentName],
          ["Date", formatDate(p.date)],
          ["Time", p.timeSlot],
        ])}
        <p style="margin:0;">Add your session notes and action points while the conversation is fresh.</p>
      `,
      ctaLabel: "Add Notes",
      ctaUrl: `https://uniplug.lovable.app/mentor-dashboard?notes=${p.bookingId}`,
    }),
  };
}

export function mentorReviewReceivedEmail(p: {
  studentName: string;
  rating: number;
  reviewExcerpt: string;
}) {
  const stars = "★".repeat(p.rating) + "☆".repeat(Math.max(0, 5 - p.rating));
  return {
    subject: `New ${p.rating}-star review — UniPlug`,
    html: shell({
      preheader: `${p.studentName} left you a ${p.rating}-star review`,
      heading: "You got a new review",
      bodyHtml: `
        <p style="margin:0;">${p.studentName} left you a review:</p>
        ${detailsBlock([
          ["Rating", stars],
          ["From", p.studentName],
        ])}
        ${p.reviewExcerpt ? `<p style="margin:0;font-style:italic;opacity:0.85;">&ldquo;${p.reviewExcerpt}&rdquo;</p>` : ""}
        <p style="margin:18px 0 0 0;">Reviews build your reputation and help new students find you.</p>
      `,
      ctaLabel: "View Reviews",
      ctaUrl: "https://uniplug.lovable.app/mentor-dashboard",
    }),
  };
}

export function mentorApprovedEmail(p: { mentorName: string }) {
  return {
    subject: "You're approved — welcome to UniPlug",
    html: shell({
      preheader: "Your mentor application was approved",
      heading: "You're in",
      bodyHtml: `
        <p style="margin:0;">${p.mentorName ? `Hi ${p.mentorName},` : "Hi,"}</p>
        <p style="margin:14px 0 0 0;">Your mentor application has been approved. Your profile is now live on UniPlug and students can book sessions with you.</p>
        <p style="margin:14px 0 0 0;">Next up: complete the safeguarding + code-of-conduct training (required before your first session), then head to your dashboard to set your availability.</p>
      `,
      ctaLabel: "Open Dashboard",
      ctaUrl: "https://uniplug.lovable.app/mentor-dashboard",
    }),
  };
}

export function mentorRejectedEmail(p: { mentorName: string; reason: string }) {
  return {
    subject: "About your UniPlug mentor application",
    html: shell({
      preheader: "An update on your UniPlug mentor application",
      heading: "About your application",
      bodyHtml: `
        <p style="margin:0;">${p.mentorName ? `Hi ${p.mentorName},` : "Hi,"}</p>
        <p style="margin:14px 0 0 0;">Thanks for applying to mentor on UniPlug. After reviewing your application, we're not able to approve it at this time.</p>
        ${p.reason ? `<p style="margin:14px 0 0 0;"><strong>Reason:</strong> ${p.reason}</p>` : ""}
        <p style="margin:14px 0 0 0;">If you think this was a mistake or you've added new credentials since applying, reply to this email and we'll take another look.</p>
      `,
      ctaLabel: "Contact Support",
      ctaUrl: "mailto:support@uniplug.app",
    }),
  };
}

// Phase G4-follow-up Stage 3: parental-consent verification email — addressed
// to the PARENT of an under-18 / gated-grade student. The consentUrl carries
// the unique consent token; the parent page (anon, token-scoped) records
// consent via record_parental_consent(token).
//
// TODO-LEGAL: the consent description below is placeholder copy. Replace with
// counsel-approved wording (what is being consented to, data handling, the
// guardian's authority to bind a minor) before public launch. consent_version
// in the DB pins which terms a given consent was recorded against.
export function parentalConsentEmail(p: { studentName: string; consentUrl: string }) {
  const name = p.studentName ? p.studentName : "your child";
  return {
    subject: "Parental consent needed for your child's UniPlug account",
    html: shell({
      preheader: "Your consent is required before your child can use UniPlug",
      heading: "Parental consent required",
      bodyHtml: `
        <p style="margin:0;">Hello,</p>
        <p style="margin:14px 0 0 0;">${name} has signed up for <strong>UniPlug</strong>, a peer-mentorship platform that connects school students with current university students for one-on-one guidance.</p>
        <p style="margin:14px 0 0 0;">Because your child is under 18, we need a parent or guardian to review and confirm consent before they can book sessions.</p>
        <!-- TODO-LEGAL: replace with counsel-approved summary of what consent covers
             (data processing, mentorship sessions, messaging, session recording) and
             the guardian's authority to agree on the minor's behalf. -->
        <p style="margin:14px 0 0 0;">Tap the button below to review what your consent covers and confirm. The link is unique to your child's account.</p>
        <p style="margin:14px 0 0 0;font-size:13px;color:${BRAND_SOFT};">If you weren't expecting this, you can ignore this email and no account access will be granted.</p>
      `,
      ctaLabel: "Review & give consent",
      ctaUrl: p.consentUrl,
    }),
  };
}
