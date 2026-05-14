import { useRef, useState } from "react";
import { Trash2, UploadCloud, FileText, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";

type Doc = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number | null;
  created_at: string;
};

const ACCEPTED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export function MyDocumentsSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const queryKey = ["my-documents", userId] as const;

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading, isError, refetch } = useQuery<Doc[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_documents")
        .select("id, file_name, storage_path, size_bytes, created_at")
        .eq("student_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (doc: Doc) => {
      await supabase.storage.from("student-documents").remove([doc.storage_path]);
      const { error } = await supabase.from("student_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onMutate: async (doc) => {
      setBusyIds((s) => new Set(s).add(doc.id));
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Doc[]>(queryKey) ?? [];
      qc.setQueryData<Doc[]>(queryKey, prev.filter((x) => x.id !== doc.id));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: (_data, _err, doc) => {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(doc.id);
        return n;
      });
    },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!ACCEPTED.includes(file.type) && !/\.(pdf|docx?)$/i.test(file.name)) {
          setUploadError(`${file.name}: only PDF, DOC, DOCX allowed`);
          continue;
        }
        if (file.size > MAX_SIZE) {
          setUploadError(`${file.name}: max 10 MB`);
          continue;
        }
        const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("student-documents")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setUploadError(`${file.name}: ${upErr.message}`);
          continue;
        }
        const { data: row, error: insErr } = await supabase
          .from("student_documents")
          .insert({
            student_id: userId,
            file_name: file.name,
            storage_path: path,
            size_bytes: file.size,
          })
          .select("id, file_name, storage_path, size_bytes, created_at")
          .single();
        if (insErr || !row) {
          await supabase.storage.from("student-documents").remove([path]);
          setUploadError(`${file.name}: ${insErr?.message ?? "Failed to save"}`);
          continue;
        }
        qc.setQueryData<Doc[]>(queryKey, (current = []) => [row as Doc, ...current]);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section id="section-documents" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">My Documents</h2>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-[#FFFCFB] px-6 py-10 text-center transition ${
          dragOver ? "border-[#C4907F] bg-[#EDE0DB]/40" : "border-[#C4907F]/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[#C4907F]" />
        ) : (
          <UploadCloud className="h-6 w-6 text-[#C4907F]" />
        )}
        <p className="mt-3 text-[14px] font-medium text-[#1A1A1A]">
          {uploading ? "Uploading…" : "Drag and drop or click to upload"}
        </p>
        <p className="mt-1 text-[12px] font-light text-[#1A1A1A]/55">
          PDF, DOC, DOCX · up to 10 MB each
        </p>
      </label>

      {uploadError && <p className="mt-3 text-[12px] text-red-600">{uploadError}</p>}

      {isError && (
        <div className="mt-4">
          <ErrorBanner message="Couldn't load your documents." onRetry={() => void refetch()} />
        </div>
      )}

      <div className="mt-5 space-y-2">
        {isLoading ? (
          <p className="text-[13px] font-light text-[#1A1A1A]/40">Loading documents…</p>
        ) : docs.length === 0 ? (
          <p className="text-[13px] font-light text-[#1A1A1A]/40">No documents uploaded yet.</p>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EDE0DB]">
                  <FileText className="h-4 w-4 text-[#C4907F]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[#1A1A1A]">
                    {doc.file_name}
                  </p>
                  <p className="text-[11px] font-light text-[#1A1A1A]/50">
                    Uploaded {new Date(doc.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeMutation.mutate(doc)}
                disabled={busyIds.has(doc.id)}
                aria-label={`Delete ${doc.file_name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#1A1A1A]/40 transition hover:bg-[#EDE0DB] hover:text-[#1A1A1A] disabled:opacity-50"
              >
                {busyIds.has(doc.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
