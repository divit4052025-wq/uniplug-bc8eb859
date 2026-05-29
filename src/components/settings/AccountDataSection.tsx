import { useState } from "react";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { exportMyData } from "@/lib/me/export.functions";
import { deleteMyAccount } from "@/lib/me/delete.functions";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

/**
 * Phase G5 UI: GDPR / DPDP data controls. Role-agnostic — the export
 * server-fn branches on the caller's role and the delete server-fn works
 * for any user, so this same component is mounted in both the mentor
 * settings surface and the (minimal) student settings surface.
 *
 *  - Export: exportMyData() returns { ok, payload } where payload is a JSON
 *    *string*; we deliver it as a client-side .json download.
 *  - Delete: deleteMyAccount() is a HARD, cascading, irreversible delete of
 *    the account and all associated data. It requires the literal confirm
 *    string "DELETE-MY-ACCOUNT"; the UI gates the action behind the user
 *    typing DELETE, then signs out + hard-redirects home on success (a toast
 *    would be cut off by the redirect, so success is surfaced in-dialog).
 */

const CONFIRM_WORD = "DELETE";

export function AccountDataSection() {
  // ── Export ────────────────────────────────────────────────────────────
  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await exportMyData();
      if (!res.ok) throw new Error(res.reason);
      return res.payload;
    },
    onSuccess: (payload) => {
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `uniplug-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data download has started.");
    },
    onError: () => {
      toast.error("Couldn't prepare your data right now — please try again later.");
    },
  });

  // ── Delete ────────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await deleteMyAccount({ data: { confirm: "DELETE-MY-ACCOUNT" } });
      if (!res.ok) throw new Error(res.reason);
      return res;
    },
    onSuccess: () => {
      // The account no longer exists; surface confirmation in-dialog, then
      // sign out and hard-redirect home (a toast wouldn't survive the nav).
      setDeleted(true);
      window.setTimeout(() => {
        void supabase.auth.signOut().finally(() => {
          window.location.href = "/";
        });
      }, 1800);
    },
    onError: () => {
      setDeleteError("We couldn't delete your account right now. Please try again later.");
    },
  });

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_WORD;
  // While pending or after success, the dialog is locked open.
  const dialogLocked = deleteMutation.isPending || deleted;

  const closeDialog = () => {
    if (dialogLocked) return;
    setDialogOpen(false);
    setConfirmText("");
    setDeleteError(null);
  };

  return (
    <div className="space-y-8">
      {/* Your data */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-[14px] font-semibold text-foreground">Your data</h3>
        <p className="mt-1 text-[13px] font-light text-muted-foreground">
          Download a copy of everything we hold about you — your profile, bookings, session notes,
          reviews, and history — as a JSON file.
        </p>
        <button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {exportMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download my data
            </>
          )}
        </button>
        {exportMutation.isError && (
          <p className="mt-3 text-[12px] font-light text-destructive">
            Couldn&apos;t prepare your data right now — please try again later.
          </p>
        )}
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-destructive/40 bg-card p-6">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Danger zone
        </h3>
        <p className="mt-1 text-[13px] font-light text-muted-foreground">
          Permanently delete your account and all associated data — bookings, session notes,
          reviews, and history. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-destructive px-5 text-[13px] font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
        >
          Delete my account
        </button>
      </section>

      <AlertDialog open={dialogOpen} onOpenChange={(open) => (open ? null : closeDialog())}>
        <AlertDialogContent
          onEscapeKeyDown={(e) => dialogLocked && e.preventDefault()}
          className="bg-card"
        >
          {deleted ? (
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground">Account deleted</AlertDialogTitle>
              <AlertDialogDescription>
                Your account and all associated data have been permanently deleted. Taking you to
                the homepage…
              </AlertDialogDescription>
            </AlertDialogHeader>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  Permanently delete your account?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This <strong className="font-semibold text-foreground">cannot be undone</strong>.
                  It permanently and irreversibly deletes your account and{" "}
                  <strong className="font-semibold text-foreground">all</strong> associated data —
                  your profile, bookings, session notes, reviews, and history. There is no recovery.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div>
                <label
                  htmlFor="delete-confirm"
                  className="block text-[12px] font-medium text-foreground"
                >
                  Type <span className="font-semibold text-destructive">{CONFIRM_WORD}</span> to
                  confirm
                </label>
                <input
                  id="delete-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  disabled={deleteMutation.isPending}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-foreground outline-none focus:border-destructive focus:ring-2 focus:ring-destructive/20 disabled:opacity-60"
                  placeholder={CONFIRM_WORD}
                />
                {deleteError && (
                  <p className="mt-2 text-[12px] font-light text-destructive">{deleteError}</p>
                )}
              </div>

              <AlertDialogFooter>
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={deleteMutation.isPending}
                  className="mt-2 inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-[13px] font-medium text-foreground transition hover:bg-muted disabled:opacity-60 sm:mt-0"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    deleteMutation.mutate();
                  }}
                  disabled={!canConfirm || deleteMutation.isPending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-destructive px-5 text-[13px] font-medium text-destructive-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Permanently delete"
                  )}
                </button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
