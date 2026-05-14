import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { todayInIST } from "@/lib/time";

type SessionRow = {
  id: string;
  date: string;
  price: number;
  student_name: string;
};

type Earnings = {
  thisMonth: number;
  allTime: number;
  nextPayout: string | null;
  rows: SessionRow[];
};

export function EarningsSection({ mentorId }: { mentorId: string }) {
  const { data, isError, refetch } = useQuery<Earnings>({
    queryKey: ["earnings", mentorId],
    queryFn: async () => {
      const { data: sessions, error: bErr } = await supabase
        .from("bookings")
        .select("id, date, price, student_id")
        .eq("mentor_id", mentorId)
        .eq("status", "completed")
        .order("date", { ascending: false });
      if (bErr) throw bErr;
      const list = sessions ?? [];

      // IST month boundary as YYYY-MM-01. String comparison against booking.date
      // (also YYYY-MM-DD) is calendar-correct without timezone parsing.
      const today = todayInIST();
      const monthStart = `${today.slice(0, 7)}-01`;
      let mo = 0;
      let total = 0;
      list.forEach((s) => {
        total += s.price ?? 0;
        if (s.date >= monthStart) mo += s.price ?? 0;
      });

      const ids = Array.from(new Set(list.map((s) => s.student_id).filter((v): v is string => !!v)));
      const nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: studs, error: sErr } = await supabase
          .from("students")
          .select("id, full_name")
          .in("id", ids);
        if (sErr) throw sErr;
        (studs ?? []).forEach((s) => nameMap.set(s.id, s.full_name));
      }
      const rows: SessionRow[] = list.slice(0, 10).map((s) => ({
        id: s.id,
        date: s.date,
        price: s.price ?? 0,
        student_name: s.student_id ? (nameMap.get(s.student_id) ?? "Student") : "Student",
      }));

      const { data: payouts, error: pErr } = await supabase
        .from("mentor_payouts")
        .select("payout_date")
        .eq("mentor_id", mentorId)
        .gte("payout_date", today)
        .order("payout_date", { ascending: true })
        .limit(1);
      if (pErr) throw pErr;

      return {
        thisMonth: mo,
        allTime: total,
        nextPayout: payouts?.[0]?.payout_date ?? null,
        rows,
      };
    },
  });

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const thisMonth = data?.thisMonth ?? 0;
  const allTime = data?.allTime ?? 0;
  const nextPayout = data?.nextPayout ?? null;
  const rows = data?.rows ?? [];

  return (
    <section id="section-earnings" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Earnings</h2>
      {isError ? (
        <div className="mt-4">
          <ErrorBanner message="Couldn't load your earnings." onRetry={() => void refetch()} />
        </div>
      ) : (
        <>
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
                      {new Date(r.date + "T00:00:00").toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(r.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
