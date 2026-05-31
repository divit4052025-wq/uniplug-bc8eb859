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
import { blockConversation, unblockConversation } from "@/lib/chat/api";

/**
 * Block / unblock confirm. Blocking makes the thread read-only in BOTH
 * directions; only the user who blocked (or an admin) can unblock — enforced
 * server-side, this dialog only ever offers "unblock" to the blocker.
 */
export function BlockDialog({
  open,
  onOpenChange,
  conversationId,
  mode,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  mode: "block" | "unblock";
  onDone: () => void;
}) {
  const mutation = useMutation({
    mutationFn: async () =>
      mode === "block" ? blockConversation(conversationId) : unblockConversation(conversationId),
    onSuccess: () => {
      toast.success(
        mode === "block" ? "Blocked. This conversation is now read-only." : "Unblocked.",
      );
      onOpenChange(false);
      onDone();
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "block" ? "Block this conversation?" : "Unblock this conversation?"}
          </DialogTitle>
          <DialogDescription>
            {mode === "block"
              ? "Neither of you will be able to send messages. You can unblock it later. All messages are retained for safeguarding."
              : "You'll both be able to send messages again."}
          </DialogDescription>
        </DialogHeader>
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
            disabled={mutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? "Working…" : mode === "block" ? "Block" : "Unblock"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
