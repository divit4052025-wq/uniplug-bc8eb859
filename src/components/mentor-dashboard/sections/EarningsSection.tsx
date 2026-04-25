import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type SessionRow = {
  id: string;
  scheduled_at: string;
  amount_inr: number;
  student_name: string;
};

export function EarningsSection({ mentorId }: { mentorId: string }) {
  const [thisMonth, setThisMonth] = useState(0);
  const [allTime, setAllTime] = useState(0);
  const [nextPayout, setNextPayout] = useState<string | null>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  const load = async () => {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, scheduled_at, amount_inr, student_id")
      .eq("mentor_id", mentorId)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false });
    const list = sessions ?? [];

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let mo = 0;
    let total = 0;
    list.forEach((s) => {
      total += s.amount_inr;
      if (new Date(s.scheduled_at) >= monthStart) mo += s.amount_inr;
    });
    setThisMonth(mo);
    setAllTime(total);

    const ids = Array.from(new Set(list.map((s) => s.student_id)));
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: studs } = await supabase
        .from("students")
        .select("id, full_name")
        .in("id", ids);
      (studs ?? []).forEach((s) => nameMap.set(s.id, s.full_name));
    }
    setRows(
      list.slice(0, 10).map((s) => ({
        id: s.id,
        scheduled_at: s.scheduled_at,
        amount_inr: s.amount_inr,
        student_name: nameMap.get(s.student_id) ?? "Student",
      }))
    );

    const { data: payouts } = await supabase
      .from("mentor_payouts")
      .select("payout_date")
      .eq("mentor_id", mentorId)
      .gte("payout_date", new Date().toISOString().slice(0, 10))
      .order("payout_date", { ascending: true })
      .limit(1);
    setNextPayout(payouts?.[0]?.payout_date ?? null);
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <section id="section-earnings" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Earnings</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="This month" value={fmt(thisMonth)} />
        <Stat label="All time" value={fmt(allTime)} />
        <Stat
          label="Next payout"
          value={nextPayout ? new Date(nextPayout).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB]">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#EDE0DB]/50 text-[11px] uppercase tracking-wide text-[#1A1A1A]/60">
            <tr>
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDE0DB] text-[#1A1A1A]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[13px] font-light text-[#1A1A1A]/60">
                  No earnings yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.student_name}</td>
                <td className="px-4 py-3 text-[#1A1A1A]/70">
                  {new Date(r.scheduled_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right font-medium">{fmt(r.amount_inr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">{label}</p>
      <p className="mt-2 font-display text-[24px] font-semibold text-[#1A1A1A]">{value}</p>
    </div>
  );
}