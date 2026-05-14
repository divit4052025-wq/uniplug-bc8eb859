import { BadgeCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";

type Plug = { id: string; full_name: string; university: string };

export function MyPlugsSection({ studentId }: { studentId: string }) {
  const {
    data: plugs = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Plug[]>({
    queryKey: ["my-plugs", studentId],
    queryFn: async () => {
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("mentor_id")
        .eq("student_id", studentId)
        .eq("status", "confirmed");
      if (bErr) throw bErr;
      const ids = Array.from(
        new Set(
          (bookings ?? []).map((b) => b.mentor_id).filter((v): v is string => !!v),
        ),
      );
      if (ids.length === 0) return [];
      const { data: mentors, error: mErr } = await supabase.rpc(
        "get_mentor_booking_names",
        { _ids: ids },
      );
      if (mErr) throw mErr;
      return ((mentors ?? []) as Plug[]);
    },
  });

  return (
    <section id="section-plugs" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">My Plugs</h2>
      {isError ? (
        <div className="mt-4">
          <ErrorBanner message="Couldn't load your plugs." onRetry={() => void refetch()} />
        </div>
      ) : isLoading ? (
        <div className="mt-4 h-32 rounded-2xl bg-[#EDE0DB]" />
      ) : plugs.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-[#EDE0DB] px-6 py-10 text-center">
          <p className="text-[15px] font-light text-[#1A1A1A]">
            You haven't found your Plug yet
          </p>
          <a
            href="/browse"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90"
          >
            Find Your Plug
          </a>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plugs.map((p) => {
            const initials = p.full_name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("");
            return (
              <article
                key={p.id}
                className="flex items-start gap-3 rounded-2xl border border-[#E8C4B8] bg-[#EDE0DB] p-5"
              >
                <div className="relative">
                  <div className="grid h-14 w-14 place-content-center rounded-full bg-[#FFFCFB] font-display text-[18px] font-semibold text-[#1A1A1A]">
                    {initials}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-content-center rounded-full bg-[#C4907F] ring-2 ring-[#EDE0DB]">
                    <BadgeCheck className="h-3 w-3 text-[#FFFCFB]" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[16px] font-bold leading-tight text-[#1A1A1A]">
                    {p.full_name}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-[#C4907F]">{p.university}</p>
                  <a
                    href="/browse"
                    className="mt-3 inline-flex h-8 items-center justify-center rounded-full bg-[#C4907F] px-3 text-[12px] font-medium text-white hover:opacity-90"
                  >
                    Book again
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
