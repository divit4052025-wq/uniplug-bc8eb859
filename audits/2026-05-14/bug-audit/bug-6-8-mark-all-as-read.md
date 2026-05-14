# Bug 6.8 — No "mark all as read" on notifications

## Plain-English description

Mentors have a notifications page at `/notifications` (linked from the
bell icon in the topbar). Each row can be marked read by clicking it
individually, but there is no "Mark all as read" action. A mentor who
has accumulated a stack of booking notifications has to click each row
to clear the unread badge — tedious for the user and bad for the dot
indicator's signal-to-noise ratio.

Visible artifacts:
- The red dot on the bell icon at `DashboardTopbar.tsx:58-60` stays lit
  as long as *any* row has `read_at IS NULL`.
- A mentor returning from a holiday with twenty unread notifications
  must click each one.

## Where the bug lives

- `src/routes/notifications.tsx:37-94` — the entire notifications page.
  The `markAsRead(id: string)` function at line 80 handles single-row
  marking only.
- `supabase/migrations/20260430000001_bug12_notifications.sql:39-49` —
  the UPDATE policy already permits the user to update any of their own
  notification rows, so the DB side requires no change.
- `src/components/dashboard/DashboardTopbar.tsx:25-37` — the unread
  counter that drives the bell dot. After "mark all as read," this
  counter should drop to zero immediately.

There is no notification-bulk RPC. There is no UI element above the
list. The space exists in `notifications.tsx:107-113` where the
greeting subtitle "Updates on your sessions and students." is rendered.

## Root cause

V1 of the notifications feature shipped intentionally minimal —
single-row marking only. The "mark all" affordance was deferred.
Nothing prevents it from working; it's purely a missing UI control
plus a single UPDATE batched on the client side.

## Proposed fixes

### Option A — Client-side bulk update (recommended)

Add a button next to the header in `notifications.tsx`. On click:


```ts
const markAllRead = async () => {
  const unreadIds = rows.filter(r => !r.read_at).map(r => r.id);
  if (unreadIds.length === 0) return;
  const optimisticReadAt = new Date().toISOString();
  setRows(prev => prev.map(r => r.read_at ? r : { ...r, read_at: optimisticReadAt }));
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: optimisticReadAt })
    .in("id", unreadIds);
  if (error) {
    // Roll back: re-fetch to be safe rather than trying to undo state.
    await load(uid);
    setError("Could not mark all as read.");
  }
};
```



UI: a small text button at the right of the title — pattern matches
existing "Dismiss" affordance at `:117-123`. Hidden when no unread rows.

Pros: simplest possible fix. Uses existing RLS UPDATE policy.
Cons: relies on the client to enumerate ids. If the list is paginated
in the future (it isn't today), the server-side approach is cleaner.

### Option B — SECURITY DEFINER RPC `mark_all_notifications_read`


```sql
CREATE FUNCTION public.mark_all_notifications_read()
RETURNS integer LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.notifications
  SET    read_at = now()
  WHERE  recipient_id = auth.uid()
    AND  read_at IS NULL
  RETURNING 1
$$;
-- Returns count of rows touched.
```


Pros: server-authoritative, scales beyond the current page size,
single round-trip regardless of unread count.
Cons: another migration, another RPC to grant.

Recommended: **Option A** for V1.1 (this audit period). Migrate to
**Option B** if the inbox volume per mentor ever exceeds the page
size.

## Risk assessment

Low. The RLS UPDATE policy already permits this operation
(`auth.uid() = recipient_id` for both USING and WITH CHECK). No
sensitive data is touched. The worst-case is "a button doesn't work,"
which the existing error banner already covers.

A subtle correctness note: the existing single-row `markAsRead` uses
the *current client time* (`new Date().toISOString()`) instead of
`now()` from the server. Option A repeats that convention for
consistency. The downside is that a mentor whose laptop clock is
skewed by a day will write a wrong `read_at` value — but this column
is only used for display ordering, not for any business logic, so the
risk is cosmetic.

## Tests that would prove the fix

1. With three unread notifications, click "Mark all as read." All
   three rows show `read_at` non-null, the bell dot disappears, and
   the unread badge in `DashboardTopbar` updates on next render.
2. With no unread notifications, the button is hidden / disabled.
3. Mid-flight failure (mock the UPDATE to return an error): the
   error banner appears, and the list re-loads to reflect actual DB
   state.
4. Concurrency: simultaneous insert from the notifications trigger
   while the mark-all UPDATE is in flight — the new row should not
   be marked read by the in-flight UPDATE since it didn't have an id
   at the time of `.in("id", unreadIds)`. (Verify in dev with two
   tabs.)
5. RLS sanity: a different mentor's notifications must not be
   touched — confirm with a dev-seed that inserts notifications for
   two mentors and asserts only the caller's rows update.

## Complexity estimate

Trivial. Option A is 30 minutes including the dev-seed for the RLS
test. Option B adds another 30 minutes for the migration.

## Dependencies

- None. Can be done at any time.
- Touches `notifications.tsx` only on the frontend.
- Bug 6.4 (silent errors) is partially fixed in `notifications.tsx`
  already, so the error-handling pattern is in place.
