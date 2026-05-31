import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { submitReport } from "@/lib/chat/api";

const REASON_MAX = 1000;

/**
 * Report the conversation (or a specific message) to admins for safeguarding
 * review. Writes an immutable message_reports row via the DEFINER RPC.
 */
export function ReportDialog({
  open,
  onOpenChange,
  conversationId,
  messageId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  messageId?: string | null;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => submitReport(conversationId, messageId, reason.trim()),
    onSuccess: () => {
      toast.success("Reported. Our team will review this conversation.");
      setReason("");
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't submit the report. Please try again."),
  });

  const canSubmit = reason.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {messageId ? "Report this message" : "Report this conversation"}
          </DialogTitle>
          <DialogDescription>
            Tell us what's wrong. Reports are sent to the UniPlug team for safeguarding review — all
            messages are retained.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
          maxLength={REASON_MAX}
          placeholder="What happened?"
          className="min-h-[100px]"
          aria-label="Reason"
        />
        <DialogFooter className="gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#EDE0DB] bg-[#FFFCFB] px-5 text-[13px] font-medium text-[#1A1A1A] hover:border-[#C4907F]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? "Submitting…" : "Submit report"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
