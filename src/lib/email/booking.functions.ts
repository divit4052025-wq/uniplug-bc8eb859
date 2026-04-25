import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  studentBookingConfirmationEmail,
  mentorBookingAlertEmail,
} from "./templates";

const FROM = "UniPlug <onboarding@resend.dev>";

async function sendViaResend(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return text;
}

export const sendBookingEmails = createServerFn({ method: "POST" })
  .inputValidator((input: { bookingId: string }) => input)
  .handler(async ({ data }) => {
    console.log("[booking-emails] handler invoked for booking", data.bookingId);
    try {
      const apiKey = process.env.RESEND_API_KEY;
      console.log("[booking-emails] RESEND_API_KEY present?", Boolean(apiKey), "length:", apiKey?.length ?? 0);
      if (!apiKey) {
        console.error("[booking-emails] RESEND_API_KEY not set");
        return { ok: false, reason: "missing_api_key" };
      }

      const { data: booking, error: bErr } = await supabaseAdmin
        .from("bookings")
        .select("id, mentor_id, student_id, date, time_slot")
        .eq("id", data.bookingId)
        .maybeSingle();
      if (bErr || !booking) {
        console.error("[booking-emails] booking not found", bErr);
        return { ok: false, reason: "booking_not_found" };
      }
      console.log("[booking-emails] booking loaded", { mentor_id: booking.mentor_id, student_id: booking.student_id });

      const [{ data: mentor }, { data: student }] = await Promise.all([
        supabaseAdmin.from("mentors").select("full_name, email").eq("id", booking.mentor_id).maybeSingle(),
        supabaseAdmin.from("students").select("full_name, email").eq("id", booking.student_id).maybeSingle(),
      ]);

      if (!mentor || !student) {
        console.error("[booking-emails] missing mentor or student");
        return { ok: false, reason: "missing_party" };
      }
      console.log("[booking-emails] sending to student:", student.email, "mentor:", mentor.email);

      const studentEmail = studentBookingConfirmationEmail({
        mentorName: mentor.full_name,
        date: booking.date,
        timeSlot: booking.time_slot,
      });
      const mentorEmail = mentorBookingAlertEmail({
        studentName: student.full_name,
        date: booking.date,
        timeSlot: booking.time_slot,
      });

      const results = await Promise.allSettled([
        sendViaResend(apiKey, student.email, studentEmail.subject, studentEmail.html),
        sendViaResend(apiKey, mentor.email, mentorEmail.subject, mentorEmail.html),
      ]);
      results.forEach((r, i) => {
        const who = i === 0 ? "student" : "mentor";
        if (r.status === "rejected") {
          console.error(`[booking-emails] send ${who} failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
        } else {
          console.log(`[booking-emails] send ${who} ok:`, r.value);
        }
      });

      return { ok: true };
    } catch (err) {
      console.error("[booking-emails] unexpected error", err);
      return { ok: false, reason: "exception" };
    }
  });