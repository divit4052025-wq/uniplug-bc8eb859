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
 * Has the booking already ended in IST? Sessions are 60 minutes — see
 * MentorCalendar.DURATION_MINUTES.
 */
export function isBookingEnded(dateStr: string, timeSlot: string): boolean {
  const [hhStr, mmStr] = timeSlot.split(":");
  const endHour = (Number.parseInt(hhStr, 10) + 1) % 24;
  return (
    Date.now() >=
    new Date(`${dateStr}T${String(endHour).padStart(2, "0")}:${mmStr}:00${IST_OFFSET}`).getTime()
  );
}

/** Format a YYYY-MM-DD date for display in IST. Example: "Wed, 14 May 2026". */
export function formatBookingDate(dateStr: string): string {
  return displayDateFmt.format(new Date(`${dateStr}T00:00:00${IST_OFFSET}`));
}

/** Format a full booking date + time. Example: "Wed, 14 May 2026 · 14:00 IST". */
export function formatBookingDateTime(dateStr: string, timeSlot: string): string {
  return `${formatBookingDate(dateStr)} · ${timeSlot} IST`;
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
