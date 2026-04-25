## Student Dashboard — Implementation Plan

A complete rebuild of `/dashboard` with persistent layout, brand palette, and real backend wiring for schools and documents. All other dashboard data (My Plugs, Sessions) shows empty states for now since no booking system exists yet.

### 1. Backend additions (Supabase migration)

**New table `student_schools`** — for the My Schools section.
- `id uuid pk default gen_random_uuid()`
- `student_id uuid not null` (matches `auth.uid()`, no FK to auth.users)
- `name text not null`
- `category text not null check in ('dream','target','safety')`
- `created_at timestamptz default now()`
- RLS enabled: select/insert/update/delete only where `auth.uid() = student_id`

**New table `student_documents`** — metadata for uploaded files.
- `id uuid pk default gen_random_uuid()`
- `student_id uuid not null`
- `file_name text not null`
- `storage_path text not null`
- `size_bytes bigint`
- `created_at timestamptz default now()`
- RLS: owner-only CRUD, mirroring above.

**New private storage bucket `student-documents`** (public = false).
- Storage RLS policies on `storage.objects` for bucket `student-documents`:
  - Authenticated users may select/insert/delete only objects whose first path segment equals `auth.uid()::text`. Files will be uploaded to `{user_id}/{timestamp}-{filename}`.
- Allowed MIME types validated client-side: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

### 2. Route + layout structure

Replace `src/routes/dashboard.tsx` with a layout route that owns the chrome (sidebar + topbar) and renders the four sections inline (single-page dashboard, no nested routes for now — the sidebar links Browse/Sessions/etc. will route to `/browse` etc., which we are NOT building in this turn; for now, non-built links scroll to the matching on-page section or show a "coming soon" inline note. **Decision: Home / Browse Plugs / My Sessions / My Documents will scroll to the corresponding dashboard sections via in-page anchors; My Progress + Settings render a small "coming soon" placeholder when clicked.** This avoids dead links without scope creep.)

Files:
- `src/routes/dashboard.tsx` — auth-gated shell, fetches first name from `students.full_name`, renders `<DashboardSidebar/>`, `<DashboardTopbar/>`, and the four sections.
- `src/components/dashboard/DashboardSidebar.tsx` — desktop left rail (240px, `#1A1A1A` bg, white Inter links, active state = 3px `#C4907F` left border + slightly brighter text). Logo at top, sign-out at bottom.
- `src/components/dashboard/DashboardTopbar.tsx` — `Good morning/afternoon/evening {firstName}` (Fraunces 28px, `#1A1A1A`) + bell icon (lucide `Bell`) on the right with a small unread dot (visual only, no notification system yet).
- `src/components/dashboard/MobileBottomNav.tsx` — fixed bottom bar on `<md` screens, `#1A1A1A` bg, six icon-only buttons (lucide icons: Home, Search, CalendarClock, FileText, TrendingUp, Settings). Active icon tinted `#C4907F`.

### 3. Section components (under `src/components/dashboard/sections/`)

**Section 1 — `MyPlugsSection.tsx`**
- Section heading "My Plugs" (Fraunces 22px).
- Empty state (default): centered card on `#EDE0DB` with copy "You haven't found your Plug yet" + `Find Your Plug` button (`#C4907F`, white text, pill) linking to `/browse` (route doesn't exist yet — link will 404 gracefully via root notFound, which is acceptable per spec).
- (Card row scaffold present but hidden until booking system exists.)

**Section 2 — `UpcomingSessionsSection.tsx`**
- Heading "Upcoming Sessions".
- Empty state: "No upcoming sessions — book one now" + `Find a Plug` button.
- (List row component built and exported but unused for now.)

**Section 3 — `MySchoolsSection.tsx`** (fully functional)
- Three columns (stack on mobile): Dream / Target / Safety.
- Loads rows from `student_schools` filtered by category on mount.
- Each school renders as a pill (`#EDE0DB` bg, `#1A1A1A` text, 12px Inter, small `×` to delete).
- `+` button at bottom of each column toggles inline input; Enter saves to Supabase, optimistic update.

**Section 4 — `MyDocumentsSection.tsx`** (fully functional)
- Drop-zone div: dashed `#C4907F` border, `#FFFCFB` bg, copy "Drag and drop or click to upload — PDF, DOC, DOCX".
- Hidden `<input type="file" accept=".pdf,.doc,.docx" multiple>`.
- On file drop/select: validate MIME + size (max 10 MB), upload to `student-documents/{userId}/{Date.now()}-{name}`, then insert metadata row into `student_documents`.
- Below drop-zone: list of uploads (filename, "Uploaded {date}", trash icon). Trash deletes the storage object AND the metadata row.
- Loading spinner per-row during upload/delete.

### 4. Behaviour & responsive details

- **Auth gate**: existing redirect to `/student-signup` if no session preserved.
- **Greeting time-of-day**: `< 12 → morning`, `< 18 → afternoon`, else `evening`.
- **First name**: split `students.full_name` on first space.
- **Sidebar visibility**: `hidden md:flex` for sidebar; `flex md:hidden` for bottom nav.
- **Main content**: `md:ml-[240px]`, max-w 1100, px-6 md:px-10, py-8.
- **All sections** spaced with `mt-12` divider feel; consistent Fraunces section titles + Inter body, matching the editorial tone of the homepage.
- **No animations** beyond a subtle fade-in on mount (consistent with homepage restraint).

### 5. Out of scope for this task (will note to user)

- Real `/browse`, `/sessions`, `/progress`, `/settings` routes — not built; sidebar links for those scroll to sections or show a small "coming soon" toast.
- Booking flow / mentor data — empty states only.
- Notification system — bell is decorative.

### Files to create
- `supabase/migrations/<timestamp>_dashboard_schools_documents.sql`
- `src/components/dashboard/DashboardSidebar.tsx`
- `src/components/dashboard/DashboardTopbar.tsx`
- `src/components/dashboard/MobileBottomNav.tsx`
- `src/components/dashboard/sections/MyPlugsSection.tsx`
- `src/components/dashboard/sections/UpcomingSessionsSection.tsx`
- `src/components/dashboard/sections/MySchoolsSection.tsx`
- `src/components/dashboard/sections/MyDocumentsSection.tsx`

### Files to edit
- `src/routes/dashboard.tsx` — full rewrite as the dashboard shell.

Approve this plan and I'll switch to build mode to implement it.