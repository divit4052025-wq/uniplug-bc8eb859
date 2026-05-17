---
name: react-query-mutation
description: Optimistic-update pattern for React Query mutations — onMutate snapshots, onError rollback, onSettled invalidate, sonner toast feedback. Canonical implementation lives at src/routes/notifications.tsx markAsRead. A shared useOptimisticMutation hook is being lifted from that pattern; when it lands, this skill points at the hook.
model_class: sonnet
triggers:
  - "Writing or modifying any useMutation in the codebase"
  - "User says: optimistic update, mutation, rollback, sonner toast"
  - "Adding a feature where a user action updates a list/table client-side"
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Skill: react-query-mutation

Uniplug uses TanStack React Query for all server state. Every mutation that affects a list/table the user is looking at goes optimistic — the UI updates instantly, the server confirms in the background, and any failure rolls back cleanly with a toast.

## The pattern

Four hooks of `useMutation`, in this order:

1. **`mutationFn`** — the actual server call.
2. **`onMutate`** — runs before `mutationFn`. Snapshot the cached query, optimistically update it, return the snapshot in the context object.
3. **`onError`** — runs if `mutationFn` rejects. Restore the snapshot from the context object. Fire a sonner toast.
4. **`onSettled`** — runs after success or error. Invalidate the affected queries so the next render reads fresh server state.

Optionally, **`onSuccess`** fires a success toast.

## Canonical implementation

`src/routes/notifications.tsx`'s `markAsRead` mutation is the reference. Read it before writing a new mutation. The shape:

```tsx
const queryClient = useQueryClient();

const markAsRead = useMutation({
  mutationFn: async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);
    if (error) throw error;
  },

  onMutate: async (notificationId) => {
    await queryClient.cancelQueries({ queryKey: ['notifications'] });
    const previous = queryClient.getQueryData<Notification[]>(['notifications']);
    queryClient.setQueryData<Notification[]>(['notifications'], (old) =>
      (old ?? []).map((n) =>
        n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
    return { previous };
  },

  onError: (_err, _id, context) => {
    if (context?.previous) {
      queryClient.setQueryData(['notifications'], context.previous);
    }
    toast.error('Could not mark as read. Please try again.');
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  },
});
```

The starting template is in `template.tsx` — copy + rename + adapt the query key, table, and field.

## Rules

- **Always `await queryClient.cancelQueries`** before reading the snapshot — otherwise an in-flight refetch can overwrite the optimistic state mid-mutation.
- **Return the snapshot from `onMutate`.** That's how `onError` gets it back. Typed as the mutation's context.
- **Invalidate, don't refetch, in `onSettled`.** Invalidation lets React Query batch and dedupe. Calling `refetchQueries` directly is rarely correct.
- **Sonner toasts on error, optionally on success.** Don't double-toast — if the action is obviously visible (a row disappears, a button changes state), success can be silent.
- **No emojis in toast copy.** See `brand-ui` skill.

## The shared hook (in progress)

There's WIP to lift this pattern into a shared `useOptimisticMutation` hook (the May 16 work in the parallel session — branch `claude/feature-batch-reviews-past-sessions-2026-05-17`, commit `d6c7de9` "Hook: shared useOptimisticMutation + notifications proof-of-pattern"). When that hook lands on `main`, this skill points at the hook and the inline pattern becomes legacy. Until then:

- New mutations use the inline pattern as shown in `template.tsx`.
- When the hook lands, migration is a follow-up — don't migrate eagerly without verifying the hook covers the call site's shape.

After the hook lands, the migration looks like:

```tsx
const markAsRead = useOptimisticMutation({
  queryKey: ['notifications'],
  mutationFn: async (id: string) => { /* ... */ },
  optimisticUpdate: (old, id) =>
    (old ?? []).map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
  errorToast: 'Could not mark as read. Please try again.',
});
```

## Anti-patterns

- **Optimistic update without a snapshot.** A failure has nothing to roll back to — you've corrupted client state.
- **Forgetting `await cancelQueries`.** Race condition where the in-flight refetch overwrites your optimistic update.
- **Invalidating with too narrow a key.** If your mutation affects multiple cached views (notifications list AND notifications count), invalidate both.
- **Silent failures.** A mutation that throws and shows no UI feedback is a UX bug. Always toast on error.
- **Throwing inside `mutationFn` without an `if (error) throw error`.** Supabase returns `{ data, error }` — error doesn't auto-throw. You must check it.

## See also

- `brand-ui` skill — toast voice and styling.
- `observability` skill — error rate on mutations is a signal worth instrumenting.
- `src/routes/notifications.tsx` — canonical implementation.
- `template.tsx` (this directory) — starting scaffold.
