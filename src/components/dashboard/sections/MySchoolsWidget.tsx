import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { createRefAddRequest } from "@/components/signup/refClient";
import type { RefItem } from "@/components/signup/types";

// Compact home-page "My Schools" widget. Groups the student's college list into
// Dream / Target / Safety (the existing student_schools.category column — values
// constrained to dream|target|safety by a CHECK). Adding reuses the shared
// RefMultiSelect typeahead over the universities ref table + the "can't find it
// → request to add" flow (createRefAddRequest); unresolved picks are still saved
// by name (student_schools.ref_university_id is nullable). Set a school's tier
// inline and remove it. Owner-CRUD RLS (auth.uid()=student_id) gates every write.
type Tier = "dream" | "target" | "safety";
type School = { id: string; name: string; category: Tier; ref_university_id: string | null };

const TIERS: { key: Tier; label: string }[] = [
  { key: "dream", label: "Dream" },
  { key: "target", label: "Target" },
  { key: "safety", label: "Safety" },
];

export function MySchoolsWidget({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const queryKey = ["my-schools", userId] as const;
  const [addTier, setAddTier] = useState<Tier>("target");

  const {
    data: schools = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<School[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_schools")
        .select("id, name, category, ref_university_id")
        .eq("student_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as School[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (vars: { name: string; category: Tier; refId: string | null }) => {
      const { data, error } = await supabase
        .from("student_schools")
        .insert({
          student_id: userId,
          name: vars.name,
          category: vars.category,
          ref_university_id: vars.refId,
        })
        .select("id, name, category, ref_university_id")
        .single();
      if (error || !data) throw error ?? new Error("Insert failed");
      return data as School;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<School[]>(queryKey) ?? [];
      const tempId = `tmp-${Date.now()}`;
      qc.setQueryData<School[]>(queryKey, [
        ...prev,
        { id: tempId, name: vars.name, category: vars.category, ref_university_id: vars.refId },
      ]);
      return { prev, tempId };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(queryKey, ctx.prev),
    onSuccess: (row, _v, ctx) =>
      qc.setQueryData<School[]>(queryKey, (cur = []) =>
        cur.map((s) => (s.id === ctx?.tempId ? row : s)),
      ),
  });

  const tierMutation = useMutation({
    mutationFn: async (vars: { id: string; category: Tier }) => {
      const { error } = await supabase
        .from("student_schools")
        .update({ category: vars.category })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<School[]>(queryKey) ?? [];
      qc.setQueryData<School[]>(
        queryKey,
        prev.map((s) => (s.id === vars.id ? { ...s, category: vars.category } : s)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(queryKey, ctx.prev),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_schools").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<School[]>(queryKey) ?? [];
      qc.setQueryData<School[]>(
        queryKey,
        prev.filter((s) => s.id !== id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(queryKey, ctx.prev),
  });

  // RefMultiSelect used as a pure picker (value held empty): a pick either has a
  // canonical ref id, or id===null → file a request-to-add and save by name.
  const onPick = (picked: RefItem[]) => {
    const p = picked[0];
    if (!p) return;
    const name = p.name.trim();
    if (!name) return;
    // Dedupe within the chosen tier.
    if (schools.some((s) => s.category === addTier && s.name.toLowerCase() === name.toLowerCase()))
      return;
    if (p.id === null) void createRefAddRequest("university", name);
    addMutation.mutate({ name, category: addTier, refId: p.id });
  };

  return (
    <section>
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">My Schools</h2>
      <p className="mt-1 text-[13px] font-light text-[#1A1A1A]/60">
        Group your college list into dream, target, and safety.
      </p>

      {isError ? (
        <div className="mt-4">
          <ErrorBanner message="Couldn't load your schools." onRetry={() => void refetch()} />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
          {isLoading ? (
            <p className="text-[12px] font-light text-[#1A1A1A]/40">Loading…</p>
          ) : (
            <div className="space-y-4">
              {TIERS.map((tier) => {
                const inTier = schools.filter((s) => s.category === tier.key);
                return (
                  <div key={tier.key}>
                    <p
                      className="text-[11px] font-medium uppercase text-[#C4907F]"
                      style={{ letterSpacing: "3px" }}
                    >
                      {tier.label}
                    </p>
                    {inTier.length === 0 ? (
                      <p className="mt-1.5 text-[12px] font-light text-[#1A1A1A]/40">
                        No schools yet
                      </p>
                    ) : (
                      <ul className="mt-1.5 space-y-1.5">
                        {inTier.map((s) => {
                          const pending = s.id.startsWith("tmp-");
                          return (
                            <li
                              key={s.id}
                              className="flex items-center gap-2 rounded-xl bg-[#EDE0DB]/50 px-3 py-1.5"
                            >
                              <span className="min-w-0 flex-1 truncate text-[13px] text-[#1A1A1A]">
                                {s.name}
                              </span>
                              <select
                                value={s.category}
                                disabled={pending}
                                aria-label={`Tier for ${s.name}`}
                                onChange={(e) =>
                                  tierMutation.mutate({
                                    id: s.id,
                                    category: e.target.value as Tier,
                                  })
                                }
                                className="h-8 shrink-0 rounded-lg border border-[#EDE0DB] bg-[#FFFCFB] px-2 text-[12px] text-[#1A1A1A] focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/30 disabled:opacity-40"
                              >
                                {TIERS.map((t) => (
                                  <option key={t.key} value={t.key}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => removeMutation.mutate(s.id)}
                                disabled={pending}
                                aria-label={`Remove ${s.name}`}
                                className="grid h-8 w-8 shrink-0 place-content-center rounded-full text-[#1A1A1A]/40 transition hover:bg-[#EDE0DB] hover:text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/30 disabled:opacity-40"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}

              {/* Add a school — shared typeahead + tier selector */}
              <div className="border-t border-[#EDE0DB] pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <RefMultiSelect
                      kind="university"
                      value={[]}
                      onChange={onPick}
                      max={1}
                      closeOnSelect
                      placeholder="Add a school…"
                      ariaLabel="Add a school"
                    />
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-[#1A1A1A]/60">
                    as
                    <select
                      value={addTier}
                      onChange={(e) => setAddTier(e.target.value as Tier)}
                      aria-label="Tier for the school you add"
                      className="h-9 rounded-lg border border-[#EDE0DB] bg-[#FFFCFB] px-2 text-[12px] text-[#1A1A1A] focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/30"
                    >
                      {TIERS.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
