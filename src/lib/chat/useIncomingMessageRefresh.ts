import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the conversation list and the notification bell fresh when a message
 * arrives while the user is NOT inside that thread. Thread.tsx already
 * subscribes to one open conversation (filtered to its conversation_id); this
 * is the complement — a recipient-scoped subscription so a brand-new
 * conversation (or a reply that lands while you're on the list or a dashboard)
 * shows up live instead of waiting for a full reload. Without it, the list /
 * bell only refresh on mount, and with queryClient's staleTime + disabled
 * refetch-on-focus a message that arrives after the page loaded stays hidden.
 *
 * RLS authorizes the recipient to read their own messages, so realtime
 * delivery is gated to the signed-in user's own incoming rows. Placed in
 * DashboardTopbar (rendered by both dashboards and MessagesLayout) so a single
 * subscription covers the bell app-wide and the conversation list on
 * /messages. Invalidations are idempotent, so overlapping with Thread's
 * subscription is harmless.
 */
export function useIncomingMessageRefresh() {
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId || cancelled) return;

      channel = supabase
        .channel(`chat-inbox:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `recipient_id=eq.${userId}`,
          },
          () => {
            void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
            void qc.invalidateQueries({ queryKey: ["notifications"] });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [qc]);
}
