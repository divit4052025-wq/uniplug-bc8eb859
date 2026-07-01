import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Clock, ShieldX, Snowflake, Check } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/consent — parental-consent oversight for minors. Status is DERIVED
 * (granted / pending / revoked) by admin_list_consent; the revocation fallout
 * (paid bookings frozen with no auto-refund) is surfaced for a human to resolve.
 * Revoke + resolve are is_admin-gated + audit-logged. Parent contact is shown only
 * as presence here — the value is revealed (and logged) on the user 360.
 */
export const Route = createFileRoute("/admin/consent")({
  component: ConsentOversight,
});

interface ConsentRow {
  student_id: string;
  full_name: string | null;
  grade: string | null;
  dob_known: boolean;
  status: string;
  has_parent_contact: boolean;
  granted_at: string | null;
  last_revoked_at: string | null;
  unresolved_fallout: number;
}
interface FalloutRow {
  event_id: string;
  student_id: string;
  student_label: string | null;
  booking_id: string | null;
  action: string;
  revoked_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

const STATUS_TABS = ["all", "pending", "granted", "revoked"] as const;
const STATUS_BADGE: Record<string, { cls: string; icon: typeof ShieldCheck; label: string }> = {
  granted: { cls: "bg-[#1f7a4d]/10 text-[#1f7a4d]", icon: ShieldCheck, label: "granted" },
  pending: { cls: "bg-[#c9a227]/15 text-[#8a6d00]", icon: Clock, label: "pending" },
  revoked: { cls: "bg-[#b4453b]/10 text-[#b4453b]", icon: ShieldX, label: "revoked" },
};

function ConsentOversight() {
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("all");
  const qc = useQueryClient();

  const register = useQuery({
    queryKey: ["admin", "consent", "register", tab],
    queryFn: async (): Promise<ConsentRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_consent", {
        _status: tab === "all" ? undefined : tab,
        _limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as ConsentRow[];
    },
  });

  const [revoking, setRevoking] = useState<ConsentRow | null>(null);
  const [reason, setReason] = useState("");
  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_revoke_consent", {
        _student_id: revoking!.student_id,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Consent revoked (logged) — bookings frozen; see fallout below");
      setRevoking(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "consent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = register.data ?? [];

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition ${
                tab === t
                  ? "bg-[#15171C] text-white"
                  : "text-[#1A1A1A]/55 hover:bg-[#1A1A1A]/[0.05]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[#E3E5E9] bg-[#FAFBFC] text-left text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
                <th className="px-3 py-2 font-semibold">Minor</th>
                <th className="px-3 py-2 font-semibold">Grade</th>
                <th className="px-3 py-2 font-semibold">Parent contact</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEFF2]">
              {register.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-[#1A1A1A]/40">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-[13px] text-[#1A1A1A]/45">
                    No consent-required minors{tab === "all" ? "." : ` with status "${tab}".`}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending;
                  const Icon = badge.icon;
                  return (
                    <tr key={r.student_id} className="hover:bg-[#FAFBFC]">
                      <td className="px-3 py-2 font-medium text-[#1A1A1A]/85">
                        <Link
                          to="/admin/users/$userId"
                          params={{ userId: r.student_id }}
                          className="hover:underline"
                        >
                          {r.full_name ?? "—"}
                        </Link>
                        {!r.dob_known && (
                          <span className="ml-2 rounded bg-[#b4453b]/10 px-1.5 py-0.5 text-[10.5px] font-medium text-[#b4453b]">
                            no DOB
                          </span>
                        )}
                        {r.unresolved_fallout > 0 && (
                          <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-[#1A1A1A]/[0.06] px-1.5 py-0.5 text-[10.5px]">
                            <Snowflake className="h-2.5 w-2.5" />
                            {r.unresolved_fallout} to resolve
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[#1A1A1A]/60">{r.grade ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.has_parent_contact ? (
                          <span className="text-[#1A1A1A]/55">on file</span>
                        ) : (
                          <span className="font-medium text-[#b4453b]">missing</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}
                        >
                          <Icon className="h-3 w-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-[#1A1A1A]/55">
                        {r.status === "revoked" && r.last_revoked_at
                          ? new Date(r.last_revoked_at).toLocaleDateString()
                          : r.granted_at
                            ? new Date(r.granted_at).toLocaleDateString()
                            : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.status === "granted" && (
                          <button
                            onClick={() => {
                              setRevoking(r);
                              setReason("");
                            }}
                            className="rounded border border-[#b4453b]/30 px-2 py-0.5 text-[11px] font-medium text-[#b4453b] hover:bg-[#b4453b]/5"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RevocationFallout />

      {revoking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg border border-[#E3E5E9] bg-white p-5 shadow-xl">
            <h3 className="text-[14px] font-semibold">Revoke consent for {revoking.full_name}</h3>
            <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
              This runs the consent cascade server-side: unpaid bookings are cancelled, paid
              bookings are frozen (no auto-refund — they appear in fallout), document shares are
              revoked, and the parent must re-consent. This is logged.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason (e.g. parent withdrew consent) — recorded in the audit log"
              className="mt-3 w-full rounded border border-[#D7DAE0] px-2 py-1.5 text-[12.5px]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRevoking(null);
                  setReason("");
                }}
                className="rounded border border-[#D7DAE0] px-3 py-1.5 text-[12px]"
              >
                Cancel
              </button>
              <button
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending || !reason.trim()}
                className="rounded bg-[#b4453b] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
              >
                Revoke consent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RevocationFallout() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const fallout = useQuery({
    queryKey: ["admin", "consent", "fallout", showResolved],
    queryFn: async (): Promise<FalloutRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_consent_fallout", {
        _include_resolved: showResolved,
      });
      if (error) throw error;
      return (data ?? []) as FalloutRow[];
    },
  });

  const resolve = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.rpc("admin_resolve_consent_event", {
        _event_id: eventId,
        _note: note.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked resolved (logged)");
      setResolving(null);
      setNote("");
      // invalidate the whole consent tree so the register's unresolved-fallout
      // badge refreshes too (not just the fallout list)
      qc.invalidateQueries({ queryKey: ["admin", "consent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = fallout.data ?? [];

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]/80">Revocation fallout</h2>
          <p className="text-[11.5px] text-[#1A1A1A]/45">
            Bookings affected by a consent revocation. Paid = frozen with no auto-refund — resolve
            once handled (e.g. refunded out-of-band).
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[11.5px] text-[#1A1A1A]/55">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          show resolved
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
        {fallout.isLoading ? (
          <div className="px-3 py-8 text-center text-[#1A1A1A]/40">
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-[#1A1A1A]/45">
            No {showResolved ? "" : "unresolved "}revocation fallout.
          </div>
        ) : (
          <div className="divide-y divide-[#EDEFF2]">
            {rows.map((r) => (
              <div key={r.event_id} className="px-3 py-2 text-[12.5px]">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                      r.action === "frozen_paid"
                        ? "bg-[#c9a227]/15 text-[#8a6d00]"
                        : "bg-[#1A1A1A]/[0.06] text-[#1A1A1A]/60"
                    }`}
                  >
                    {r.action.replace("_", " ")}
                  </span>
                  <Link
                    to="/admin/users/$userId"
                    params={{ userId: r.student_id }}
                    className="text-[#1A1A1A]/70 hover:underline"
                  >
                    {r.student_label ?? "student"}
                  </Link>
                  <span className="font-mono text-[11px] text-[#1A1A1A]/45">
                    booking {r.booking_id?.slice(0, 8)}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-[#1A1A1A]/45">
                    {new Date(r.revoked_at).toLocaleDateString()}
                  </span>
                  {r.resolved_at ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#1f7a4d]">
                      <Check className="h-3 w-3" /> resolved
                    </span>
                  ) : resolving === r.event_id ? null : (
                    <button
                      onClick={() => {
                        setResolving(r.event_id);
                        setNote("");
                      }}
                      className="rounded border border-[#D7DAE0] px-2 py-0.5 text-[11px] font-medium hover:bg-[#1A1A1A]/[0.04]"
                    >
                      Resolve
                    </button>
                  )}
                </div>
                {r.resolved_at && r.resolution_note && (
                  <div className="mt-0.5 pl-1 text-[11px] text-[#1A1A1A]/45">
                    {r.resolution_note}
                  </div>
                )}
                {resolving === r.event_id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Resolution note (e.g. refunded ₹1500 via gateway) — optional"
                      className="flex-1 rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
                    />
                    <button
                      onClick={() => resolve.mutate(r.event_id)}
                      disabled={resolve.isPending}
                      className="rounded bg-[#15171C] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                    >
                      Mark resolved
                    </button>
                    <button
                      onClick={() => {
                        setResolving(null);
                        setNote("");
                      }}
                      className="rounded border border-[#D7DAE0] px-2.5 py-1 text-[12px]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
