// IST-canonical time helpers. All bookings store dates and times in IST
// (Asia/Kolkata, UTC+5:30) regardless of the user's local timezone. This
// module is the single source of truth for "today" and time formatting so
// every page sees the same calendar day.

const IST_TIMEZONE = "Asia/Kolkata" as const;
const IST_OFFSET = "+05:30" as const;

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIMEZONE,
  hour: "2-digit",
  hour12: false,
});

const weekdayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIMEZONE,
  weekday: "short",
});

const displayDateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type Weekday = (typeof WEEKDAYS)[number];

/** Today's date in IST, formatted as YYYY-MM-DD. */
export function todayInIST(): string {
  return dateFmt.format(new Date());
}

/** Current hour in IST as a zero-padded "HH" string (00-23). */
export function currentISTHour(): string {
  return hourFmt.format(new Date()).slice(0, 2);
}

/** IST weekday index for "now": 0=Sun, 1=Mon, ..., 6=Sat. */
function istWeekdayIndex(): number {
  return WEEKDAYS.indexOf(weekdayFmt.format(new Date()) as Weekday);
}

/** Has the booking's start time already passed in IST? */
export function isBookingStarted(dateStr: string, timeSlot: string): boolean {
  return Date.now() >= new Date(`${dateStr}T${timeSlot}:00${IST_OFFSET}`).getTime();
}

/**
 * Has the booking already ended in IST? Duration-aware: a 30-min booking ends
 * 30 minutes after its start, a 60-min booking 60 minutes after. Computed on the
 * epoch timeline (start-ms + duration) rather than modulo-24 hour arithmetic, so
 * it stays correct for :30 slots and across midnight.
 *
 * `durationMinutes` defaults to 60 to preserve behaviour for callers that don't
 * yet thread the booking's duration. The client filter is a UX nicety only — the
 * server (authorize_video_join) remains the authority for join eligibility.
 */
export function isBookingEnded(dateStr: string, timeSlot: string, durationMinutes = 60): boolean {
  const startMs = new Date(`${dateStr}T${timeSlot}:00${IST_OFFSET}`).getTime();
  return Date.now() >= startMs + durationMinutes * 60_000;
}

/** Hours from now until the booking's start in IST (negative once started).
 *  Used to preview the cancellation refund tier (the server's
 *  cancel_booking_as_student remains the authority for the actual amount). */
export function hoursUntilStartIST(dateStr: string, timeSlot: string): number {
  const startMs = new Date(`${dateStr}T${timeSlot}:00${IST_OFFSET}`).getTime();
  return (startMs - Date.now()) / 3_600_000;
}

/** Format a YYYY-MM-DD date for display in IST. Example: "Wed, 14 May 2026". */
export function formatBookingDate(dateStr: string): string {
  return displayDateFmt.format(new Date(`${dateStr}T00:00:00${IST_OFFSET}`));
}

/** Format a full booking date + time. Example: "Wed, 14 May 2026 · 14:00 IST". */
export function formatBookingDateTime(dateStr: string, timeSlot: string): string {
  return `${formatBookingDate(dateStr)} · ${timeSlot} IST`;
}

const messageTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIMEZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Format a chat-message timestamptz for display in IST. Example: "31 May, 14:32". */
export function formatMessageTime(iso: string): string {
  return messageTimeFmt.format(new Date(iso));
}

/** Time-of-day greeting derived from current IST hour. */
export function istGreeting(): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = Number.parseInt(currentISTHour(), 10);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Current IST week's Monday as YYYY-MM-DD. */
export function startOfISTWeekMonday(): string {
  const today = todayInIST();
  const daysBack = (istWeekdayIndex() + 6) % 7;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** Current IST week's Sunday as YYYY-MM-DD. */
export function endOfISTWeekSunday(): string {
  const today = todayInIST();
  const daysForward = 6 - ((istWeekdayIndex() + 6) % 7);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysForward);
  return d.toISOString().slice(0, 10);
}
