import { createServerFn } from "@tanstack/react-start";
import { Resend } from "resend";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  studentBookingConfirmationEmail,
  mentorBookingAlertEmail,
} from "./templates";

const FROM = "UniPlug <onboarding@resend.dev>";

export const sendBookingEmails = createServerFn({ method: "POST" })
  .inputValidator((input: { bookingId: string }) => input)
  .handler(async ({ data }) => {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error("[booking-emails] RESEND_API_KEY not set");
        return { ok: false, reason: "missing_api_key" };
      }
      const resend = new Resend(apiKey);

      const { data: booking, error: bErr } = await supabaseAdmin
        .from("bookings")
        .select("id, mentor_id, student_id, date, time_slot")
        .eq("id", data.bookingId)
        .maybeSingle();
      if (bErr || !booking) {
        console.error("[booking-emails] booking not found", bErr);
        return { ok: false, reason: "booking_not_found" };
      }

      const [{ data: mentor }, { data: student }] = await Promise.all([
        supabaseAdmin.from("mentors").select("full_name, email").eq("id", booking.mentor_id).maybeSingle(),
        supabaseAdmin.from("students").select("full_name, email").eq("id", booking.student_id).maybeSingle(),
      ]);

      if (!mentor || !student) {
        console.error("[booking-emails] missing mentor or student");
        return { ok: false, reason: "missing_party" };
      }

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
        resend.emails.send({ from: FROM, to: student.email, subject: studentEmail.subject, html: studentEmail.html }),
        resend.emails.send({ from: FROM, to: mentor.email, subject: mentorEmail.subject, html: mentorEmail.html }),
      ]);
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.error(`[booking-emails] send ${i === 0 ? "student" : "mentor"} failed`, r.reason);
        }
      });

      return { ok: true };
    } catch (err) {
      console.error("[booking-emails] unexpected error", err);
      return { ok: false, reason: "exception" };
    }
  });