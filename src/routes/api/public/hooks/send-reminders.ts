import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { studentReminderEmail, mentorReminderEmail } from "@/lib/email/templates";
import { bearerOk } from "@/lib/auth/bearer";
import { FROM } from "@/lib/email/from";

// Windows supported by this endpoint. Phase A3 (2026-05-23) wired '24h'
// behind tomorrowISTDate(); Phase C2 added '1h' which uses a time-range
// filter on (date + time_slot) IST instead of just date.
const ALLOWED_WINDOWS = new Set(["24h", "1h"]);

async function sendViaResend(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// Returns the YYYY-MM-DD for "tomorrow" in IST (UTC+5:30).
function tomorrowISTDate(): string {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  istNow.setUTCDate(istNow.getUTCDate() + 1);
  return istNow.toISOString().slice(0, 10);
}

// Epoch ms for the start of a YYYY-MM-DD + HH:00 booking, interpreted IST.
function bookingStartMsIST(dateISO: string, timeSlot: string): number {
  return new Date(`${dateISO}T${timeSlot}:00+05:30`).getTime();
}

type BookingRow = {
  id: string;
  mentor_id: string | null;
  student_id: string | null;
  date: string;
  time_slot: string;
  status: string;
};

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        // Phase A3: Bearer-token auth. Endpoint was previously unauth'd
        // under /api/public/ — anyone POST → mass Resend dispatch.
        const expectedSecret = process.env.CRON_SECRET;
        if (!expectedSecret) {
          console.error("[reminders] CRON_SECRET not set in worker env");
          return new Response(
            JSON.stringify({ ok: false, reason: "missing_cron_secret" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        if (!bearerOk(request.headers.get("authorization"), expectedSecret)) {
          console.warn("[reminders] auth denied", {
            ip: request.headers.get("cf-connecting-ip"),
            ua: request.headers.get("user-agent"),
          });
          return new Response(
            JSON.stringify({ ok: false, reason: "unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const window = new URL(request.url).searchParams.get("window") ?? "24h";
        if (!ALLOWED_WINDOWS.has(window)) {
          return new Response(
            JSON.stringify({
              ok: false,
              reason: "unsupported_window",
              window,
              allowed: Array.from(ALLOWED_WINDOWS),
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ ok: false, reason: "missing_api_key" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Pull candidate bookings. For 24h we fetch by date=tomorrow IST.
        // For 1h we fetch today+tomorrow and JS-filter by start time
        // (Supabase REST can't easily express date+time_slot composition).
        let bookings: BookingRow[];
        const targetDate = tomorrowISTDate();
        if (window === "24h") {
          const { data, error } = await supabaseAdmin
            .from("bookings")
            .select("id, mentor_id, student_id, date, time_slot, status")
            .eq("date", targetDate)
            .eq("status", "confirmed");
          if (error) {
            console.error("[reminders] failed to load bookings", error);
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          bookings = data ?? [];
        } else {
          // window === "1h": ±15-minute tolerance around now+60min IST.
          const now = Date.now();
          const windowStart = now + 45 * 60_000;
          const windowEnd = now + 75 * 60_000;
          const istNow = new Date(now + 5.5 * 60 * 60_000);
          const today = istNow.toISOString().slice(0, 10);
          const tomorrow = new Date(istNow.getTime() + 24 * 60 * 60_000)
            .toISOString()
            .slice(0, 10);
          const { data, error } = await supabaseAdmin
            .from("bookings")
            .select("id, mentor_id, student_id, date, time_slot, status")
            .in("date", [today, tomorrow])
            .eq("status", "confirmed");
          if (error) {
            console.error("[reminders] failed to load bookings", error);
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          bookings = (data ?? []).filter((b) => {
            const ts = bookingStartMsIST(b.date, b.time_slot);
            return ts >= windowStart && ts <= windowEnd;
          });
        }

        let sent = 0;
        let failed = 0;
        let skipped = 0;
        for (const b of bookings) {
          try {
            if (!b.mentor_id || !b.student_id) {
              skipped++;
              console.warn("[reminders] orphan booking — skipping", {
                booking_id: b.id,
                mentor_id_null: b.mentor_id === null,
                student_id_null: b.student_id === null,
              });
              continue;
            }
            const [{ data: mentor }, { data: student }] = await Promise.all([
              supabaseAdmin
                .from("mentors")
                .select("full_name, email")
                .eq("id", b.mentor_id)
                .maybeSingle(),
              supabaseAdmin
                .from("students")
                .select("full_name, email")
                .eq("id", b.student_id)
                .maybeSingle(),
            ]);
            if (!mentor || !student) {
              failed++;
              continue;
            }
            const sEmail = studentReminderEmail({
              mentorName: mentor.full_name,
              date: b.date,
              timeSlot: b.time_slot,
            });
            const mEmail = mentorReminderEmail({
              studentName: student.full_name,
              date: b.date,
              timeSlot: b.time_slot,
            });
            const results = await Promise.allSettled([
              sendViaResend(apiKey, student.email, sEmail.subject, sEmail.html),
              sendViaResend(apiKey, mentor.email, mEmail.subject, mEmail.html),
            ]);
            results.forEach((r, i) => {
              if (r.status === "rejected") {
                failed++;
                console.error(
                  `[reminders] send ${i === 0 ? "student" : "mentor"} for booking ${b.id} failed`,
                  r.reason,
                );
              } else {
                sent++;
              }
            });
          } catch (err) {
            failed++;
            console.error(`[reminders] booking ${b.id} threw`, err);
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            window,
            target_date: window === "24h" ? targetDate : null,
            processed: bookings.length,
            sent,
            failed,
            skipped,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
