import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Eye,
  AlertTriangle,
  Pause,
  Ban,
  RotateCcw,
  Snowflake,
  ShieldAlert,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/users/$userId — 360 profile. Identity + account_moderation state,
 * consent (student) / verification (mentor), bookings, safeguarding reports
 * involving the user, and warnings. Account actions (suspend/ban/restore, warn)
 * and the contact reveal are the audited P1 RPCs. Contact is masked by default.
 */
export const Route = createFileRoute("/admin/users_/$userId")({
  component: UserProfile,
});

interface Profile {
  user_id: string;
  role: string;
  full_name: string | null;
  created_at: string;
  account_state: string;
  account_reason: string | null;
  grade: string | null;
  school: string | null;
  requires_consent: boolean | null;
  dob_known: boolean | null;
  has_consent: boolean | null;
  parental_consent_at: string | null;
  university: string | null;
  course: string | null;
  year: string | null;
  mentor_status: string | null;
  tier: string | null;
  is_adult: boolean | null;
}
interface Contact {
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  parent_phone: string | null;
  parent_email: string | null;
}

const STATE_STYLE: Record<string, string> = {
  active: "bg-[#1f7a4d]/10 text-[#1f7a4d]",
  suspended: "bg-[#c9a227]/15 text-[#8a6d00]",
  banned: "bg-[#b4453b]/10 text-[#b4453b]",
};

function UserProfile() {
  const { userId } = useParams({ from: "/admin/users_/$userId" });
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "user", userId] });

  const { data: p, isLoading } = useQuery({
    queryKey: ["admin", "user", userId, "profile"],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.rpc("admin_get_user_profile", { _user_id: userId });
      if (error) throw error;
      return ((data ?? [])[0] as Profile) ?? null;
    },
  });
  const bookings = useQuery({
    queryKey: ["admin", "user", userId, "bookings"],
    queryFn: async () =>
      (await supabase.rpc("admin_list_user_bookings", { _user_id: userId })).data ?? [],
  });
  const reports = useQuery({
    queryKey: ["admin", "user", userId, "reports"],
    queryFn: async () =>
      (await supabase.rpc("admin_list_user_reports", { _user_id: userId })).data ?? [],
  });
  const warnings = useQuery({
    queryKey: ["admin", "user", userId, "warnings"],
    queryFn: async () =>
      (await supabase.rpc("admin_list_user_warnings", { _user_id: userId })).data ?? [],
  });

  if (isLoading)
    return (
      <div className="py-10 text-center text-[#1A1A1A]/40">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
      </div>
    );
  if (!p)
    return <div className="py-10 text-center text-[13px] text-[#1A1A1A]/45">User not found.</div>;

  return (
    <div>
      <Link
        to="/admin/users"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to directory
      </Link>

      <div className="grid grid-cols-[1fr_320px] gap-5">
        <div className="space-y-4">
          {/* header */}
          <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[16px] font-semibold">{p.full_name ?? "—"}</h2>
                <div className="text-[12px] text-[#1A1A1A]/50">
                  {p.role} · joined {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATE_STYLE[p.account_state] ?? ""}`}
              >
                {p.account_state}
              </span>
            </div>
            {p.account_reason && (
              <div className="mt-1.5 text-[12px] text-[#1A1A1A]/55">Reason: {p.account_reason}</div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#EDEFF2] pt-3 text-[12.5px]">
              {p.role === "student" ? (
                <>
                  <Info
                    label="Grade · School"
                    value={[p.grade, p.school].filter(Boolean).join(" · ")}
                  />
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide text-[#1A1A1A]/40">
                      Consent
                    </div>
                    {!p.requires_consent ? (
                      <span className="text-[#1A1A1A]/50">not required (18+)</span>
                    ) : p.has_consent ? (
                      <span className="text-[#1f7a4d]">
                        granted
                        {p.parental_consent_at
                          ? ` · ${new Date(p.parental_consent_at).toLocaleDateString()}`
                          : ""}
                      </span>
                    ) : !p.dob_known ? (
                      <span className="font-semibold text-[#b4453b]">
                        age unknown — consent required
                      </span>
                    ) : (
                      <span className="font-semibold text-[#b4453b]">
                        consent required — not on file
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Info
                    label="University · Course"
                    value={[p.university, p.course].filter(Boolean).join(" · ")}
                  />
                  <Info
                    label="Verification"
                    value={
                      <span>
                        {p.mentor_status}
                        {p.tier === "enhanced" ? " · enhanced" : ""}
                        {p.is_adult === false ? " · not 18+" : ""}
                      </span>
                    }
                  />
                </>
              )}
            </div>
          </section>

          {/* bookings */}
          <ListCard title="Bookings" empty="No bookings." loading={bookings.isLoading}>
            {(bookings.data ?? []).map(
              (b: {
                id: string;
                role_in: string;
                counterpart_label: string | null;
                date: string;
                time_slot: string;
                status: string;
                frozen: boolean;
              }) => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
                  <span className="w-[86px] font-mono text-[11.5px] text-[#1A1A1A]/60">
                    {b.date}
                  </span>
                  <span className="text-[#1A1A1A]/45">{b.time_slot}</span>
                  <span className="flex-1 text-[#1A1A1A]/75">
                    as {b.role_in} · with {b.counterpart_label}
                  </span>
                  {b.frozen && (
                    <span className="rounded bg-[#1A1A1A]/[0.06] px-1.5 py-0.5 text-[10.5px]">
                      frozen
                    </span>
                  )}
                  <span className="text-[#1A1A1A]/55">{b.status}</span>
                </div>
              ),
            )}
          </ListCard>

          {/* reports involving */}
          <ListCard title="Reports involving this user" empty="None." loading={reports.isLoading}>
            {(reports.data ?? []).map(
              (r: {
                source: string;
                report_id: string;
                role_in: string;
                category: string;
                status: string;
              }) => (
                <Link
                  key={`${r.source}:${r.report_id}`}
                  to="/admin/safeguarding/$source/$reportId"
                  params={{ source: r.source, reportId: r.report_id }}
                  className="flex items-center gap-3 px-3 py-1.5 text-[12.5px] hover:bg-[#FAFBFC]"
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-[#b4453b]/70" />
                  <span className="flex-1 text-[#1A1A1A]/75">
                    {r.category.replace(/_/g, " ")} · as {r.role_in}
                  </span>
                  <span className="rounded bg-[#1A1A1A]/[0.06] px-1.5 py-0.5 text-[10.5px]">
                    {r.status.replace("_", " ")}
                  </span>
                </Link>
              ),
            )}
          </ListCard>
        </div>

        {/* right: actions */}
        <div className="space-y-4">
          {/* key={userId}: reset revealed-PII / action state if the profile param changes */}
          <ContactPanel key={userId} userId={userId} />
          <AccountActions key={`act-${userId}`} userId={userId} onDone={invalidate} />
          {(warnings.data ?? []).length > 0 && (
            <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
                Warnings
              </div>
              <ul className="space-y-1 text-[12px] text-[#1A1A1A]/70">
                {(warnings.data ?? []).map(
                  (w: { id: string; reason: string; created_at: string }) => (
                    <li key={w.id}>
                      {w.reason}{" "}
                      <span className="text-[#1A1A1A]/35">
                        · {new Date(w.created_at).toLocaleDateString()}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-[#1A1A1A]/40">{label}</div>
      <div className="text-[#1A1A1A]/85">{value || "—"}</div>
    </div>
  );
}

function ListCard({
  title,
  empty,
  loading,
  children,
}: {
  title: string;
  empty: string;
  loading?: boolean;
  children: ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const has = arr.length > 0;
  return (
    <section className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
      <div className="border-b border-[#E3E5E9] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
        {title}
      </div>
      <div className="divide-y divide-[#EDEFF2]">
        {loading ? (
          <div className="px-3 py-4 text-center text-[#1A1A1A]/30">
            <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
          </div>
        ) : has ? (
          children
        ) : (
          <div className="px-3 py-4 text-center text-[12px] text-[#1A1A1A]/40">{empty}</div>
        )}
      </div>
    </section>
  );
}

function ContactPanel({ userId }: { userId: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  const reveal = useMutation({
    mutationFn: async (): Promise<Contact | null> => {
      // The justification is recorded in the audit log — require a real per-reveal
      // reason (not a constant) for the console's highest-sensitivity action.
      const { data, error } = await supabase.rpc("admin_reveal_contact", {
        _user_id: userId,
        _justification: why.trim(),
      });
      if (error) throw error;
      return ((data ?? [])[0] as Contact) ?? null;
    },
    onSuccess: (c) => {
      setContact(c);
      setAsking(false);
      setWhy("");
      toast.success("Contact revealed (logged)");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
          Contact
        </span>
        {!contact && !asking && (
          <button
            onClick={() => setAsking(true)}
            className="inline-flex items-center gap-1 text-[11px] text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
          >
            <Eye className="h-3 w-3" /> reveal
          </button>
        )}
      </div>
      {contact ? (
        <div className="space-y-0.5 text-[12.5px] text-[#1A1A1A]/80">
          {contact.email && <div>{contact.email}</div>}
          {contact.phone && <div>{contact.phone}</div>}
          {contact.parent_phone && <div>parent: {contact.parent_phone}</div>}
          {contact.parent_email && <div>parent: {contact.parent_email}</div>}
        </div>
      ) : asking ? (
        <div>
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={2}
            placeholder="Why are you revealing this contact? (recorded in the audit log)"
            className="w-full rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={() => reveal.mutate()}
              disabled={reveal.isPending || !why.trim()}
              className="rounded bg-[#15171C] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
            >
              Reveal (logged)
            </button>
            <button
              onClick={() => {
                setAsking(false);
                setWhy("");
              }}
              className="rounded border border-[#D7DAE0] px-2.5 py-1 text-[12px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-[#1A1A1A]/40">Masked — reveal is logged.</div>
      )}
    </section>
  );
}

function AccountActions({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [open, setOpen] = useState<null | "warn" | "suspended" | "banned">(null);
  const [reason, setReason] = useState("");
  const act = useMutation({
    mutationFn: async (kind: "warn" | "suspended" | "banned" | "active") => {
      if (kind === "warn") {
        const { error } = await supabase.rpc("admin_warn_user", {
          _user_id: userId,
          _reason: reason,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("admin_set_account_state", {
          _user_id: userId,
          _state: kind,
          _reason: reason || undefined,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Action applied (logged)");
      setOpen(null);
      setReason("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
        Account actions
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Btn icon={AlertTriangle} label="Warn" onClick={() => setOpen("warn")} />
        <Btn icon={Pause} label="Suspend" onClick={() => setOpen("suspended")} />
        <Btn icon={Ban} label="Ban" danger onClick={() => setOpen("banned")} />
        <Btn icon={RotateCcw} label="Restore" onClick={() => act.mutate("active")} />
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10.5px] text-[#1A1A1A]/40">
        <Snowflake className="h-3 w-3" /> Suspend/ban blocks new bookings, messages, and live
        sessions server-side.
      </p>
      {open && (
        <div className="mt-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={`Reason for ${open === "warn" ? "warning" : open}`}
            className="w-full rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={() => act.mutate(open)}
              disabled={act.isPending || (open !== "warn" && !reason)}
              className="rounded bg-[#b4453b] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
            >
              Confirm {open === "warn" ? "warn" : open}
            </button>
            <button
              onClick={() => {
                setOpen(null);
                setReason("");
              }}
              className="rounded border border-[#D7DAE0] px-2.5 py-1 text-[12px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Btn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Ban;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11.5px] font-medium ${danger ? "border-[#b4453b]/30 text-[#b4453b] hover:bg-[#b4453b]/5" : "border-[#D7DAE0] text-[#1A1A1A]/70 hover:bg-[#1A1A1A]/[0.04]"}`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}
