import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Eye,
  ShieldAlert,
  Ban,
  Pause,
  RotateCcw,
  AlertTriangle,
  Snowflake,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/safeguarding/$source/$reportId — the case-360. One screen: the report,
 * the flagged conversation (message reports, read via the admin is_admin() RLS
 * path), both parties (PII-masked until an explicit logged reveal), the related
 * booking, triage controls, and the server-enforced + audited actions (freeze/
 * cancel booking, warn/suspend/ban, record escalation). admin_get_report_case
 * logs the view; every action RPC gates is_admin() and writes the audit log.
 */
export const Route = createFileRoute("/admin/safeguarding_/$source/$reportId")({
  component: CaseView,
});

interface CaseRow {
  source: string;
  report_id: string;
  created_at: string;
  category: string;
  content: string | null;
  reporter_id: string | null;
  reporter_label: string | null;
  subject_user_id: string | null;
  subject_label: string | null;
  conversation_id: string | null;
  reported_message_id: string | null;
  booking_id: string | null;
  status: string;
  severity: string | null;
  notes: string | null;
}
interface Msg {
  id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  soft_deleted: boolean;
  reported: boolean;
}
interface Contact {
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  parent_phone: string | null;
  parent_email: string | null;
}

const ESC_CHANNELS = [
  { key: "childline_1098", label: "Childline 1098" },
  { key: "cyber_crime_portal", label: "Cyber-crime portal" },
  { key: "law_enforcement", label: "Law enforcement" },
  { key: "other", label: "Other" },
];

function CaseView() {
  const { source, reportId } = useParams({ from: "/admin/safeguarding_/$source/$reportId" });
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "case", source, reportId] });
    // distinct key prefix — react-query does element-wise prefix matching, so
    // ["admin","case",...] does NOT match ["admin","case-esc",...]; invalidate it
    // explicitly so a just-recorded escalation shows without a reload.
    qc.invalidateQueries({ queryKey: ["admin", "case-esc", source, reportId] });
    qc.invalidateQueries({ queryKey: ["admin", "safeguarding-queue"] });
  };

  const { data: kase, isLoading } = useQuery({
    queryKey: ["admin", "case", source, reportId],
    queryFn: async (): Promise<CaseRow | null> => {
      const { data, error } = await supabase.rpc("admin_get_report_case", {
        _source: source,
        _report_id: reportId,
      });
      if (error) throw error;
      return ((data ?? [])[0] as CaseRow) ?? null;
    },
  });

  const { data: messages } = useQuery({
    enabled: !!kase?.conversation_id,
    queryKey: ["admin", "case-msgs", kase?.conversation_id],
    queryFn: async (): Promise<Msg[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, created_at, soft_deleted, reported")
        .eq("conversation_id", kase!.conversation_id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const { data: escalations } = useQuery({
    queryKey: ["admin", "case-esc", source, reportId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_escalations", {
        _source: source,
        _report_id: reportId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading)
    return (
      <div className="py-10 text-center text-[#1A1A1A]/40">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
      </div>
    );
  if (!kase)
    return <div className="py-10 text-center text-[13px] text-[#1A1A1A]/45">Report not found.</div>;

  return (
    <div>
      <Link
        to="/admin/safeguarding"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
      </Link>

      <div className="grid grid-cols-[1fr_360px] gap-5">
        {/* ── Left: report + conversation ─────────────────────────────── */}
        <div className="space-y-4">
          <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-[#1A1A1A]/50">
              {kase.source === "message" ? "Chat report" : "Safety report"} ·{" "}
              {kase.category.replace(/_/g, " ")} · {new Date(kase.created_at).toLocaleString()}
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#1A1A1A]/85">
              {kase.content ?? "—"}
            </p>
          </section>

          {kase.conversation_id && (
            <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
                Flagged conversation
              </div>
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                {(messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md border px-2.5 py-1.5 text-[12.5px] ${
                      m.id === kase.reported_message_id
                        ? "border-[#b4453b]/40 bg-[#b4453b]/[0.04]"
                        : "border-[#EDEFF2] bg-[#FAFBFC]"
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-2 text-[10.5px] text-[#1A1A1A]/40">
                      <span className="font-mono">{m.sender_id.slice(0, 8)}</span>
                      <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                      {m.soft_deleted && (
                        <span className="rounded bg-[#1A1A1A]/10 px-1">deleted</span>
                      )}
                      {m.reported && (
                        <span className="rounded bg-[#b4453b]/10 px-1 text-[#b4453b]">
                          reported
                        </span>
                      )}
                    </div>
                    <div className="text-[#1A1A1A]/85">
                      {m.body ?? <em className="text-[#1A1A1A]/40">(no body)</em>}
                    </div>
                  </div>
                ))}
                {(messages ?? []).length === 0 && (
                  <div className="text-[12px] text-[#1A1A1A]/40">No messages loaded.</div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* ── Right: parties + triage + actions ───────────────────────── */}
        <div className="space-y-4">
          <TriagePanel
            source={source}
            reportId={reportId}
            status={kase.status}
            severity={kase.severity}
            notes={kase.notes}
            onDone={invalidate}
          />

          <PartyPanel label="Reporter" userId={kase.reporter_id} masked={kase.reporter_label} />
          <PartyPanel
            label="Subject"
            userId={kase.subject_user_id}
            masked={kase.subject_label}
            showActions
            onDone={invalidate}
          />

          {kase.booking_id && <BookingPanel bookingId={kase.booking_id} onDone={invalidate} />}

          <EscalationPanel
            source={source}
            reportId={reportId}
            subjectId={kase.subject_user_id}
            escalations={escalations ?? []}
            onDone={invalidate}
          />
        </div>
      </div>
    </div>
  );
}

// ── Triage ────────────────────────────────────────────────────────────────
function TriagePanel({
  source,
  reportId,
  status,
  severity,
  notes,
  onDone,
}: {
  source: string;
  reportId: string;
  status: string;
  severity: string | null;
  notes: string | null;
  onDone: () => void;
}) {
  const [s, setS] = useState(status);
  const [sev, setSev] = useState(severity ?? "");
  const [n, setN] = useState(notes ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_set_report_triage", {
        _source: source,
        _report_id: reportId,
        _status: s,
        _severity: sev || undefined,
        _notes: n || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Triage updated");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
        Triage
      </div>
      <div className="flex gap-2">
        <select
          value={s}
          onChange={(e) => setS(e.target.value)}
          className="flex-1 rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
        >
          {["new", "in_review", "actioned", "closed"].map((o) => (
            <option key={o} value={o}>
              {o.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={sev}
          onChange={(e) => setSev(e.target.value)}
          className="flex-1 rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
        >
          <option value="">severity…</option>
          {["low", "medium", "high", "critical"].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={n}
        onChange={(e) => setN(e.target.value)}
        placeholder="Internal notes"
        rows={2}
        className="mt-2 w-full rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
      />
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="mt-2 w-full rounded bg-[#15171C] py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
      >
        Save triage
      </button>
    </section>
  );
}

// ── Party (with masked → logged reveal + subject actions) ──────────────────
function PartyPanel({
  label,
  userId,
  masked,
  showActions,
  onDone,
}: {
  label: string;
  userId: string | null;
  masked: string | null;
  showActions?: boolean;
  onDone?: () => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const reveal = useMutation({
    mutationFn: async (): Promise<Contact | null> => {
      const { data, error } = await supabase.rpc("admin_reveal_contact", {
        _user_id: userId!,
        _justification: "safeguarding case review",
      });
      if (error) throw error;
      return ((data ?? [])[0] as Contact) ?? null;
    },
    onSuccess: (c) => {
      setContact(c);
      toast.success("Contact revealed (logged)");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
          {label}
        </span>
        {userId && !contact && (
          <button
            onClick={() => reveal.mutate()}
            disabled={reveal.isPending}
            className="inline-flex items-center gap-1 text-[11px] text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
          >
            <Eye className="h-3 w-3" /> reveal
          </button>
        )}
      </div>
      {contact ? (
        <div className="space-y-0.5 text-[12.5px] text-[#1A1A1A]/85">
          <div className="font-medium">
            {contact.full_name ?? "—"} <span className="text-[#1A1A1A]/45">({contact.role})</span>
          </div>
          {contact.email && <div className="text-[#1A1A1A]/60">{contact.email}</div>}
          {contact.phone && <div className="text-[#1A1A1A]/60">{contact.phone}</div>}
          {contact.parent_phone && (
            <div className="text-[#1A1A1A]/60">parent: {contact.parent_phone}</div>
          )}
          {contact.parent_email && (
            <div className="text-[#1A1A1A]/60">parent: {contact.parent_email}</div>
          )}
        </div>
      ) : (
        <div className="font-mono text-[12.5px] text-[#1A1A1A]/70">{masked ?? "unknown"}</div>
      )}
      {showActions && userId && <SubjectActions userId={userId} onDone={onDone} />}
    </section>
  );
}

function SubjectActions({ userId, onDone }: { userId: string; onDone?: () => void }) {
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
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-3 border-t border-[#EDEFF2] pt-3">
      <div className="flex flex-wrap gap-1.5">
        <ActBtn icon={AlertTriangle} label="Warn" onClick={() => setOpen("warn")} />
        <ActBtn icon={Pause} label="Suspend" onClick={() => setOpen("suspended")} />
        <ActBtn icon={Ban} label="Ban" danger onClick={() => setOpen("banned")} />
        <ActBtn icon={RotateCcw} label="Restore" onClick={() => act.mutate("active")} />
      </div>
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
    </div>
  );
}

function ActBtn({
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

// ── Booking freeze/cancel ──────────────────────────────────────────────────
function BookingPanel({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const act = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_freeze_or_cancel_booking", {
        _booking_id: bookingId,
        _reason: "safeguarding action",
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (a) => {
      toast.success(
        a === "freeze_paid_booking"
          ? "Paid booking frozen (no refund asserted)"
          : "Unpaid booking cancelled",
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
        Related booking
      </div>
      <div className="mb-2 font-mono text-[11px] text-[#1A1A1A]/50">{bookingId.slice(0, 8)}</div>
      <button
        onClick={() => act.mutate()}
        disabled={act.isPending}
        className="inline-flex items-center gap-1.5 rounded border border-[#D7DAE0] px-2.5 py-1 text-[12px] font-medium text-[#1A1A1A]/75 hover:bg-[#1A1A1A]/[0.04]"
      >
        <Snowflake className="h-3.5 w-3.5" /> Freeze / cancel booking
      </button>
      <p className="mt-1.5 text-[11px] text-[#1A1A1A]/40">
        Cancels if unpaid, freezes in place if paid. No refund is asserted here.
      </p>
    </section>
  );
}

// ── Escalation ─────────────────────────────────────────────────────────────
function EscalationPanel({
  source,
  reportId,
  subjectId,
  escalations,
  onDone,
}: {
  source: string;
  reportId: string;
  subjectId: string | null;
  escalations: { id: string; channel: string; reference_note: string | null; created_at: string }[];
  onDone: () => void;
}) {
  const [channel, setChannel] = useState("childline_1098");
  const [note, setNote] = useState("");
  const rec = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_record_escalation", {
        _channel: channel,
        _subject_user_id: subjectId ?? undefined,
        _source: source,
        _report_id: reportId,
        _note: note || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Escalation recorded (logged)");
      setNote("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="rounded-lg border border-[#E3E5E9] bg-white p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
        <ShieldAlert className="h-3.5 w-3.5" /> Record escalation
      </div>
      <select
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        className="w-full rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
      >
        {ESC_CHANNELS.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reference / note"
        className="mt-2 w-full rounded border border-[#D7DAE0] px-2 py-1 text-[12px]"
      />
      <button
        onClick={() => rec.mutate()}
        disabled={rec.isPending}
        className="mt-2 w-full rounded bg-[#15171C] py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
      >
        Record referral
      </button>
      {escalations.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-[#EDEFF2] pt-2 text-[11.5px] text-[#1A1A1A]/60">
          {escalations.map((e) => (
            <li key={e.id}>
              {e.channel.replace(/_/g, " ")} · {new Date(e.created_at).toLocaleDateString()}
              {e.reference_note ? ` · ${e.reference_note}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
