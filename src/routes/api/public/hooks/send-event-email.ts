import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bearerOk } from "@/lib/auth/bearer";
import { FROM } from "@/lib/email/from";
import {
  studentBookingCancelledEmail,
  mentorBookingCancelledEmail,
  studentSessionCompletedEmail,
  mentorSessionCompletedEmail,
  mentorReviewReceivedEmail,
  mentorApprovedEmail,
  mentorRejectedEmail,
} from "@/lib/email/templates";

/**
 * Phase C2 (2026-05-23) — unified event-driven email dispatcher.
 *
 * One endpoint, switched by `type`. Reuses CRON_SECRET bearer auth (same
 * token as send_reminders_24h so triggers only need one Vault secret).
 *
 * Event types:
 *  - "booking_cancelled"      payload: { booking_id }
 *  - "session_completed"      payload: { booking_id }
 *  - "review_received"        payload: { review_id }
 *  - "mentor_approved"        payload: { mentor_id }
 *  - "mentor_rejected"        payload: { mentor_id, reason? }
 *
 * Triggers in migration 20260523000004 POST to this endpoint after the
 * relevant DB write lands. Failures are logged but do not retry — pg_net
 * does not retry by default. Phase H3 / Sentry will surface persistent
 * failures.
 */

async function sendViaResend(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

type EventBody =
  | { type: "booking_cancelled"; booking_id: string }
  | { type: "session_completed"; booking_id: string }
  | { type: "review_received"; review_id: string }
  | { type: "mentor_approved"; mentor_id: string }
  | { type: "mentor_rejected"; mentor_id: string; reason?: string };

export const Route = createFileRoute("/api/public/hooks/send-event-email")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const expectedSecret = process.env.CRON_SECRET;
        if (!expectedSecret) {
          console.error("[event-email] CRON_SECRET not set in worker env");
          return new Response(
            JSON.stringify({ ok: false, reason: "missing_cron_secret" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        if (!bearerOk(request.headers.get("authorization"), expectedSecret)) {
          console.warn("[event-email] auth denied", {
            ip: request.headers.get("cf-connecting-ip"),
            ua: request.headers.get("user-agent"),
          });
          return new Response(
            JSON.stringify({ ok: false, reason: "unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ ok: false, reason: "missing_api_key" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: EventBody;
        try {
          body = (await request.json()) as EventBody;
        } catch {
          return new Response(JSON.stringify({ ok: false, reason: "invalid_json" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          switch (body.type) {
            case "booking_cancelled":
            case "session_completed":
              return await dispatchBookingEvent(apiKey, body);
            case "review_received":
              return await dispatchReviewReceived(apiKey, body);
            case "mentor_approved":
            case "mentor_rejected":
              return await dispatchMentorStatus(apiKey, body);
            default: {
              const exhaustive: never = body;
              return new Response(
                JSON.stringify({ ok: false, reason: "unknown_type", body: exhaustive }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
          }
        } catch (err) {
          console.error("[event-email] dispatch threw", { type: body.type, err });
          return new Response(
            JSON.stringify({
              ok: false,
              reason: "dispatch_failed",
              type: body.type,
              error: err instanceof Error ? err.message : String(err),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

async function dispatchBookingEvent(
  apiKey: string,
  body: { type: "booking_cancelled" | "session_completed"; booking_id: string },
) {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, mentor_id, student_id, date, time_slot, status")
    .eq("id", body.booking_id)
    .maybeSingle();
  if (error || !booking) {
    return new Response(
      JSON.stringify({ ok: false, reason: "booking_not_found", booking_id: body.booking_id }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!booking.mentor_id || !booking.student_id) {
    console.warn("[event-email] orphan booking", { booking_id: booking.id });
    return new Response(
      JSON.stringify({ ok: true, skipped: "orphan_booking" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const [{ data: mentor }, { data: student }] = await Promise.all([
    supabaseAdmin.from("mentors").select("full_name, email").eq("id", booking.mentor_id).maybeSingle(),
    supabaseAdmin.from("students").select("full_name, email").eq("id", booking.student_id).maybeSingle(),
  ]);
  if (!mentor || !student) {
    return new Response(
      JSON.stringify({ ok: false, reason: "user_not_found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const sEmail =
    body.type === "booking_cancelled"
      ? studentBookingCancelledEmail({
          mentorName: mentor.full_name,
          date: booking.date,
          timeSlot: booking.time_slot,
        })
      : studentSessionCompletedEmail({
          mentorName: mentor.full_name,
          date: booking.date,
          timeSlot: booking.time_slot,
          bookingId: booking.id,
        });
  const mEmail =
    body.type === "booking_cancelled"
      ? mentorBookingCancelledEmail({
          studentName: student.full_name,
          date: booking.date,
          timeSlot: booking.time_slot,
        })
      : mentorSessionCompletedEmail({
          studentName: student.full_name,
          date: booking.date,
          timeSlot: booking.time_slot,
          bookingId: booking.id,
        });

  const results = await Promise.allSettled([
    sendViaResend(apiKey, student.email, sEmail.subject, sEmail.html),
    sendViaResend(apiKey, mentor.email, mEmail.subject, mEmail.html),
  ]);
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(
        `[event-email] ${body.type}: send ${i === 0 ? "student" : "mentor"} failed`,
        r.reason,
      );
    }
  });
  return new Response(JSON.stringify({ ok: true, type: body.type, sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function dispatchReviewReceived(
  apiKey: string,
  body: { type: "review_received"; review_id: string },
) {
  const { data: review, error } = await supabaseAdmin
    .from("reviews")
    .select("id, mentor_id, student_id, rating, review")
    .eq("id", body.review_id)
    .maybeSingle();
  if (error || !review) {
    return new Response(
      JSON.stringify({ ok: false, reason: "review_not_found", review_id: body.review_id }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const [{ data: mentor }, { data: student }] = await Promise.all([
    supabaseAdmin.from("mentors").select("full_name, email").eq("id", review.mentor_id).maybeSingle(),
    supabaseAdmin.from("students").select("full_name").eq("id", review.student_id).maybeSingle(),
  ]);
  if (!mentor || !student) {
    return new Response(JSON.stringify({ ok: false, reason: "user_not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const excerpt = review.review ? review.review.slice(0, 200) : "";
  const email = mentorReviewReceivedEmail({
    studentName: student.full_name,
    rating: review.rating,
    reviewExcerpt: excerpt,
  });
  try {
    await sendViaResend(apiKey, mentor.email, email.subject, email.html);
    return new Response(JSON.stringify({ ok: true, type: "review_received", sent: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[event-email] review_received send failed", err);
    return new Response(
      JSON.stringify({ ok: false, reason: "send_failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function dispatchMentorStatus(
  apiKey: string,
  body: { type: "mentor_approved" | "mentor_rejected"; mentor_id: string; reason?: string },
) {
  const { data: mentor, error } = await supabaseAdmin
    .from("mentors")
    .select("full_name, email")
    .eq("id", body.mentor_id)
    .maybeSingle();
  if (error || !mentor) {
    return new Response(
      JSON.stringify({ ok: false, reason: "mentor_not_found", mentor_id: body.mentor_id }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const email =
    body.type === "mentor_approved"
      ? mentorApprovedEmail({ mentorName: mentor.full_name })
      : mentorRejectedEmail({ mentorName: mentor.full_name, reason: body.reason ?? "" });
  try {
    await sendViaResend(apiKey, mentor.email, email.subject, email.html);
    return new Response(JSON.stringify({ ok: true, type: body.type, sent: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[event-email] ${body.type} send failed`, err);
    return new Response(
      JSON.stringify({ ok: false, reason: "send_failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
