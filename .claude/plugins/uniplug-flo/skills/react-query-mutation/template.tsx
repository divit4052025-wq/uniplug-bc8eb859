// Optimistic-mutation scaffold. Copy, rename, adapt:
//   1. THING / Thing / things — replace with the real domain noun
//   2. ['things'] — the React Query key for the affected cache
//   3. mutationFn — the actual Supabase / RPC call
//   4. The optimistic update inside setQueryData — how the cache mutates
//   5. The error toast copy
//
// Reference implementation: src/routes/notifications.tsx markAsRead.
// When useOptimisticMutation lands on main, prefer that hook over this
// scaffold — see the react-query-mutation SKILL.md for the migrated shape.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase'; // adapt path

type Thing = {
  id: string;
  // ...fields
};

export function useMarkThing() {
  const queryClient = useQueryClient();

  return useMutation<
    void,                              // TData (return)
    Error,                             // TError
    string,                            // TVariables (the thing id)
    { previous: Thing[] | undefined }  // TContext (snapshot from onMutate)
  >({
    mutationFn: async (thingId) => {
      const { error } = await supabase
        .from('things')
        .update({ /* the patch */ })
        .eq('id', thingId);
      if (error) throw error;
    },

    onMutate: async (thingId) => {
      // Cancel in-flight refetches so they can't overwrite our optimistic state.
      await queryClient.cancelQueries({ queryKey: ['things'] });

      // Snapshot the current cache value for rollback in onError.
      const previous = queryClient.getQueryData<Thing[]>(['things']);

      // Optimistically mutate the cache.
      queryClient.setQueryData<Thing[]>(['things'], (old) =>
        (old ?? []).map((t) =>
          t.id === thingId ? { ...t, /* applied patch */ } : t,
        ),
      );

      return { previous };
    },

    onError: (_err, _thingId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['things'], context.previous);
      }
      toast.error('Could not update. Please try again.');
    },

    onSettled: () => {
      // Sync with server-of-truth on completion (success or failure).
      queryClient.invalidateQueries({ queryKey: ['things'] });
    },
  });
}
