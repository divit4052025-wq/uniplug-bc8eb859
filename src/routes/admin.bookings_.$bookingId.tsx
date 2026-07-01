import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Snowflake, IndianRupee, Video, Info } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/bookings/$bookingId — booking (session) detail. Masked parties linked to
 * their 360s, schedule, a light read-only money summary, and the ONLY honest join
 * signal (video_join_audit = a Daily token was issued — not proof of attendance).
 * Freeze/cancel reuses the P1 audited admin_freeze_or_cancel_booking (no refund).
 */
export const Route = createFileRoute("/admin/bookings_/$bookingId")({
  component: BookingDetail,
});

interface Booking {
  id: string;
  status: string;
  date: string;
  time_slot: string;
  duration: number;
  price: number;
  student_id: string | null;
  student_label: string | null;
  mentor_id: string | null;
  mentor_label: string | null;
  paid_at: string | null;
  frozen_at: string | null;
  has_payment: boolean;
  refund_status: string | null;
  refund_amount_inr: number | null;
  subject: string | null;
  description: string | null;
  reschedule_count: number | null;
}
interface JoinRow {
  role: string;
  user_id: string | null;
  user_label: string | null;
  issued_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-[#1f7a4d]/10 text-[#1f7a4d]",
  completed: "bg-[#1A1A1A]/[0.06] text-[#1A1A1A]/60",
  pending_payment: "bg-[#c9a227]/15 text-[#8a6d00]",
  reserved: "bg-[#c9a227]/15 text-[#8a6d00]",
  cancelled: "bg-[#b4453b]/10 text-[#b4453b]",
  payment_failed: "bg-[#b4453b]/10 text-[#b4453b]",
  expired: "bg-[#1A1A1A]/[0.06] text-[#1A1A1A]/45",
};

function BookingDetail() {
  const { bookingId } = useParams({ from: "/admin/bookings_/$bookingId" });
  const qc = useQueryClient();

  const { data: b, isLoading } = useQuery({
    queryKey: ["admin", "booking", bookingId, "detail"],
    queryFn: async (): Promise<Booking | null> => {
      const { data, error } = await supabase.rpc("admin_get_booking", { _booking_id: bookingId });
      if (error) throw error;
      return ((data ?? [])[0] as Booking) ?? null;
    },
  });
  const joins = useQuery({
    queryKey: ["admin", "booking", bookingId, "joins"],
    queryFn: async (): Promise<JoinRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_booking_joins", {
        _booking_id: bookingId,
      });
      if (error) throw error;
      return (data ?? []) as JoinRow[];
    },
  });

  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const freezeCancel = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_freeze_or_cancel_booking", {
        _booking_id: bookingId,
        _reason: reason.trim() || undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (outcome) => {
      toast.success(
        outcome === "freeze_paid_booking"
          ? "Paid booking frozen (logged) — no refund issued"
          : "Unpaid booking cancelled (logged)",
      );
      setConfirming(false);
      setReason("");
      // Patch the detail in place rather than invalidating it — a refetch of
      // admin_get_booking would append a second view_booking audit row.
      qc.setQueryData<Booking | null>(["admin", "booking", bookingId, "detail"], (old) =>
        old
          ? {
              ...old,
              frozen_at:
                outcome === "freeze_paid_booking" ? new Date().toISOString() : old.frozen_at,
              status: outcome === "cancel_unpaid_booking" ? "cancelled" : old.status,
            }
          : old,
      );
      qc.invalidateQueries({ queryKey: ["admin", "bookings"] }); // ledger
    },
    onError: (e: Error) =>
      toast.error(
        /not_freezable/.test(e.message)
          ? "This booking is terminal — nothing to freeze or cancel"
          : e.message,
      ),
  });

  if (isLoading)
    return (
      <div className="py-10 text-center text-[#1A1A1A]/40">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
      </div>
    );
  if (!b)
    return (
      <div className="py-10 text-center text-[13px] text-[#1A1A1A]/45">Booking not found.</div>
    );

  const freezable =
    b.status === "confirmed" || b.status === "pending_payment" || b.status === "reserved";

  return (
    <div>
      <Link
        to="/admin/bookings"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to ledger
      </Link>

      <div className="grid grid-cols-[1fr_300px] gap-5">
        <div className="space-y-4">
          {/* header */}
          <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[15px] font-semibold">
                  {b.date} · {b.time_slot}{" "}
                  <span className="text-[12px] font-normal text-[#1A1A1A]/45">
                    ({b.duration} min)
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] text-[#1A1A1A]/55">
                  {b.subject ? `${b.subject} · ` : ""}booking {b.id.slice(0, 8)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {b.frozen_at && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-[#3b6bb4]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#3b6bb4]">
                    <Snowflake className="h-3 w-3" /> frozen
                  </span>
                )}
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[b.status] ?? ""}`}
                >
                  {b.status.replace("_", " ")}
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#EDEFF2] pt-3 text-[12.5px]">
              <Party label="Student" id={b.student_id} labelText={b.student_label} />
              <Party label="Mentor" id={b.mentor_id} labelText={b.mentor_label} />
            </div>
            {b.description && (
              <div className="mt-3 border-t border-[#EDEFF2] pt-3 text-[12.5px] text-[#1A1A1A]/70">
                {b.description}
              </div>
            )}
          </section>

          {/* join activity (honest) */}
          <section className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
            <div className="flex items-center gap-2 border-b border-[#E3E5E9] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
              <Video className="h-3.5 w-3.5" /> Join activity
            </div>
            {joins.isLoading ? (
              <div className="px-3 py-4 text-center text-[#1A1A1A]/30">
                <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
              </div>
            ) : (joins.data ?? []).length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-[#1A1A1A]/40">
                No join tokens were issued.
              </div>
            ) : (
              <div className="divide-y divide-[#EDEFF2]">
                {(joins.data ?? []).map((j, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
                    <span className="w-[60px] text-[#1A1A1A]/55">{j.role}</span>
                    <span className="flex-1 text-[#1A1A1A]/75">{j.user_label}</span>
                    <span className="font-mono text-[11px] text-[#1A1A1A]/45">
                      token issued {new Date(j.issued_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start gap-1.5 border-t border-[#EDEFF2] px-3 py-2 text-[10.5px] text-[#1A1A1A]/40">
              <Info className="mt-px h-3 w-3 shrink-0" />A row means a join token was issued to that
              party — authorization to join, not proof of attendance or connection.{" "}
              {b.status === "completed" &&
                "Status “completed” is set automatically after the slot passes."}
            </div>
          </section>
        </div>

        {/* right: money + actions */}
        <div className="space-y-4">
          <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
              Money
            </div>
            <div className="space-y-1.5 text-[12.5px]">
              <Row label="Price">
                <span className="inline-flex items-center gap-0.5 font-medium">
                  <IndianRupee className="h-3 w-3 opacity-50" />
                  {b.price}
                </span>
              </Row>
              <Row label="Paid">
                {b.price === 0 ? (
                  <span className="text-[#1A1A1A]/45">free (₹0)</span>
                ) : b.has_payment ? (
                  <span className="text-[#1f7a4d]">
                    yes{b.paid_at ? ` · ${new Date(b.paid_at).toLocaleDateString()}` : ""}
                  </span>
                ) : (
                  <span className="text-[#1A1A1A]/45">no</span>
                )}
              </Row>
              <Row label="Refund">
                {b.refund_status ? (
                  <span
                    className={
                      b.refund_status === "pending" ? "text-[#8a6d00]" : "text-[#1A1A1A]/60"
                    }
                  >
                    {b.refund_status}
                    {b.refund_amount_inr != null ? ` · ₹${b.refund_amount_inr}` : ""}
                  </span>
                ) : (
                  <span className="text-[#1A1A1A]/45">none</span>
                )}
              </Row>
            </div>
            <p className="mt-2 text-[10.5px] text-[#1A1A1A]/40">
              Full payment ledger is in Payments.
            </p>
          </section>

          <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
              Actions
            </div>
            {freezable ? (
              !confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  className="w-full rounded border border-[#b4453b]/30 px-2.5 py-1.5 text-[12px] font-medium text-[#b4453b] hover:bg-[#b4453b]/5"
                >
                  {b.status === "confirmed" ? "Freeze booking" : "Cancel unpaid booking"}
                </button>
              ) : (
                <div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (logged)"
                    className="w-full rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
                  />
                  <div className="mt-1.5 flex gap-2">
                    <button
                      onClick={() => freezeCancel.mutate()}
                      disabled={freezeCancel.isPending}
                      className="rounded bg-[#b4453b] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => {
                        setConfirming(false);
                        setReason("");
                      }}
                      className="rounded border border-[#D7DAE0] px-2.5 py-1 text-[12px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            ) : (
              <p className="text-[12px] text-[#1A1A1A]/45">
                Terminal booking — no freeze/cancel available.
              </p>
            )}
            <p className="mt-2 text-[10.5px] text-[#1A1A1A]/40">
              Freeze blocks the video join server-side. Confirmed = frozen (no refund); unpaid =
              cancelled.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Party({
  label,
  id,
  labelText,
}: {
  label: string;
  id: string | null;
  labelText: string | null;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-[#1A1A1A]/40">{label}</div>
      {id ? (
        <Link
          to="/admin/users/$userId"
          params={{ userId: id }}
          className="text-[#1A1A1A]/85 hover:underline"
        >
          {labelText}
        </Link>
      ) : (
        <span className="text-[#1A1A1A]/50">{labelText}</span>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#1A1A1A]/45">{label}</span>
      {children}
    </div>
  );
}
