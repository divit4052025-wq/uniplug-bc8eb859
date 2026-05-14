import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";

type Category = "dream" | "target" | "safety";
type School = { id: string; name: string; category: Category };

const COLUMNS: { key: Category; label: string }[] = [
  { key: "dream", label: "Dream" },
  { key: "target", label: "Target" },
  { key: "safety", label: "Safety" },
];

export function MySchoolsSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const queryKey = ["my-schools", userId] as const;

  const { data: schools = [], isLoading, isError, refetch } = useQuery<School[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_schools")
        .select("id, name, category")
        .eq("student_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as School[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ category, name }: { category: Category; name: string }) => {
      const { data, error } = await supabase
        .from("student_schools")
        .insert({ student_id: userId, name, category })
        .select("id, name, category")
        .single();
      if (error || !data) throw error ?? new Error("Insert failed");
      return data as School;
    },
    onMutate: async ({ category, name }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<School[]>(queryKey) ?? [];
      const tempId = `tmp-${Date.now()}`;
      qc.setQueryData<School[]>(queryKey, [...prev, { id: tempId, name, category }]);
      return { prev, tempId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(queryKey, ctx.prev);
    },
    onSuccess: (row, _vars, ctx) => {
      qc.setQueryData<School[]>(queryKey, (current = []) =>
        current.map((s) => (s.id === ctx?.tempId ? row : s)),
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_schools").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<School[]>(queryKey) ?? [];
      qc.setQueryData<School[]>(queryKey, prev.filter((s) => s.id !== id));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(queryKey, ctx.prev);
    },
  });

  const add = (category: Category, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addMutation.mutate({ category, name: trimmed });
  };

  const remove = (id: string) => {
    removeMutation.mutate(id);
  };

  return (
    <section id="section-schools" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">My Schools</h2>
      {isError && (
        <div className="mt-4">
          <ErrorBanner message="Couldn't load your schools." onRetry={() => void refetch()} />
        </div>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <Column
            key={col.key}
            label={col.label}
            category={col.key}
            schools={schools.filter((s) => s.category === col.key)}
            loading={isLoading}
            onAdd={(name) => add(col.key, name)}
            onRemove={remove}
          />
        ))}
      </div>
    </section>
  );
}

function Column({
  label,
  schools,
  loading,
  onAdd,
  onRemove,
}: {
  label: string;
  category: Category;
  schools: School[];
  loading: boolean;
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  const submit = () => {
    onAdd(value);
    setValue("");
    setAdding(false);
  };

  return (
    <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
      <p
        className="text-[11px] font-medium uppercase text-[#C4907F]"
        style={{ letterSpacing: "3px" }}
      >
        {label}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {loading ? (
          <span className="text-[12px] font-light text-[#1A1A1A]/40">Loading…</span>
        ) : schools.length === 0 && !adding ? (
          <span className="text-[12px] font-light text-[#1A1A1A]/40">No schools yet</span>
        ) : (
          schools.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#EDE0DB] px-3 py-1.5 text-[12px] font-medium text-[#1A1A1A]"
            >
              {s.name}
              <button
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.name}`}
                className="text-[#1A1A1A]/40 transition hover:text-[#1A1A1A]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
      {adding ? (
        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                setAdding(false);
                setValue("");
              }
            }}
            placeholder="School name"
            className="flex-1 rounded-full border border-[#EDE0DB] bg-[#FFFCFB] px-3 py-1.5 text-[13px] text-[#1A1A1A] focus:border-[#C4907F] focus:outline-none"
          />
          <button
            onClick={submit}
            className="inline-flex h-8 items-center rounded-full bg-[#C4907F] px-3 text-[12px] font-medium text-white"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#1A1A1A]/60 transition hover:text-[#C4907F]"
        >
          <Plus className="h-3.5 w-3.5" /> Add school
        </button>
      )}
    </div>
  );
}
