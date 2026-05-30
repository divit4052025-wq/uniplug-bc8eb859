import { useMutation } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** a****@domain.com — enough to recognise, not to fully reveal. */
function maskEmail(email: string | null): string {
  if (!email) return "your parent's email";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

/**
 * Phase G4-follow-up Stage 3: calm "awaiting parental consent" notice for an
 * under-18 student whose parent hasn't confirmed yet. Used on the dashboard
 * (full notice + resend) and as the booking-suppression explainer on browse /
 * mentor profile (compact). The DB still hard-blocks booking regardless.
 */
export function AwaitingConsentNotice({
  studentId,
  parentEmail,
  compact = false,
  className,
}: {
  studentId: string;
  parentEmail: string | null;
  compact?: boolean;
  className?: string;
}) {
  const resend = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("request_parental_consent", { _student_id: studentId });
      if (error) throw error;
    },
    onSuccess: () => toast.success("We've re-sent the consent email to your parent."),
    onError: () => toast.error("Couldn't resend right now. Please try again later."),
  });

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 sm:p-6", className)}>
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-display text-[16px] font-semibold text-foreground">
            Waiting for parental consent
          </h3>
          <p className="mt-1 text-[13px] font-light leading-relaxed text-muted-foreground">
            Because you're under 18, a parent or guardian needs to give consent before you can book
            sessions. We emailed a consent request to{" "}
            <span className="font-medium text-foreground">{maskEmail(parentEmail)}</span>
            {compact ? "." : " — booking unlocks as soon as they confirm."}
          </p>
          {!compact && (
            <button
              type="button"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-[12px] font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {resend.isPending ? "Resending…" : "Resend email to parent"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
