import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { studentReminderEmail, mentorReminderEmail } from "@/lib/email/templates";
import { bearerOk } from "@/lib/auth/bearer";

const FROM = "UniPlug <onboarding@resend.dev>";

// Windows supported by this endpoint. Phase A3 (2026-05-23) wires '24h'
// behind the existing tomorrowISTDate() logic. Phase C2 will add '1h'.
const ALLOWED_WINDOWS = new Set(["24h"]);

async function sendViaResend(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// Returns the YYYY-MM-DD for "tomorrow" in IST (UTC+5:30) since bookings are India-facing.
function tomorrowISTDate(): string {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  istNow.setUTCDate(istNow.getUTCDate() + 1);
  return istNow.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        // Phase A3: Bearer-token auth. Without this guard the endpoint
        // was POSTable by anyone and would scan all confirmed bookings
        // for tomorrow IST + send two Resend emails each — cost + spam.
        // CRON_SECRET must match the pg_cron job's bearer (the migration
        // reads from vault.decrypted_secrets to inject it).
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

        // Window param. Today only '24h'; C2 will add '1h'. Default
        // preserves prior caller-less behavior for any operator who
        // POSTs the endpoint manually for an ad-hoc next-day send.
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
        const targetDate = tomorrowISTDate();

        const { data: bookings, error } = await supabaseAdmin
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

        let sent = 0;
        let failed = 0;
        let skipped = 0;
        for (const b of bookings ?? []) {
          try {
            // Bookings have ON DELETE SET NULL on mentor_id and student_id,
            // so an orphan can have either field null. Skip the reminder
            // (nobody to send to) and log enough context to investigate.
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
            date: targetDate,
            processed: bookings?.length ?? 0,
            sent,
            failed,
            skipped,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    },
  },
});
