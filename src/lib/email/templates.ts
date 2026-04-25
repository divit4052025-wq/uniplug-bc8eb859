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
          ["Duration", "30 minutes"],
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