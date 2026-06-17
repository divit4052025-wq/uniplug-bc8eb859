# UniPlug UI-overhaul inventory — four surfaces

**Date:** 2026-06-17 · **Branch:** `claude/ui-overhaul-inventory-2026-06-17` (cut from `origin/main` @ `d01b674`)
**Status:** read-only investigation. No code/schema/data was changed; the hosted Supabase project (`ncfhmbugjeuerchleegq`) was never touched.

## Purpose

We are about to **redesign and fully wire** four surfaces — **student signup, mentor signup, student dashboard, mentor dashboard**. This document inventories what each surface captures/shows today, maps every element to its backing table/column/RPC/server-fn, and marks it **WIRED** or **SCAFFOLDED** — so a new design can be drawn against what the backend actually has, and so we surface (A) backend that exists but is used nowhere and (B) frontend that is fake/unbacked.

## Method

Five read-only agents inventoried the backend reference + the four surfaces in parallel, then an adversarial synthesis pass produced the cross-cutting A/B lists (re-grepping each candidate to confirm a thing "missing" from one surface isn't actually wired in another). Source-of-truth precedence: (1) `supabase/migrations/*.sql`, (2) `src/integrations/supabase/types.ts` (generated), (3) route/component/server-fn code under `src/`. No live DB was queried. Findings cite `file:line` / `table.column` / `rpc_name` throughout.

## Legend

- **WIRED** — a route/component/server-fn actually reads or writes it (proven by grep + file:line).
- **SCAFFOLDED** — backend exists in migrations/types but no UI reads/writes it.
- **indirect** — written via a DB trigger/RPC the app invokes (e.g. `handle_new_user`, `record_parental_consent`) rather than a direct `.from()`; counted WIRED for the write, but flagged when it is never *read*/surfaced (a redesign signal).
- **"SCAFFOLDED (for this surface)"** — used elsewhere in the app but not on the surface in question (it is *not* a global gap; see the synthesis reconciliation notes). There are **no Supabase edge functions** in this repo, so cron/webhook-only DB objects read as SCAFFOLDED from the app's perspective.

## Counts at a glance

| Surface | WIRED | SCAFFOLDED |
|---|---|---|
| Student signup | 23 captured fields | 5 deliberately-unwritten cols |
| Mentor signup | 18 captured fields | 3 (code-of-conduct/training) |
| Student dashboard | 38 elements | 9 elements |
| Mentor dashboard | 23 elements | 6 elements |
| Backend objects overall (appendix) | ≈62 | ≈19 |

**Cross-cutting: A. Backend-without-frontend = 25 verified items · B. Frontend-without-backend = 3 verified items.**

## Headline takeaways (for the redesign)

- **Entirely-scaffolded backend domains** with zero UI: **document sharing** (`document_shares`/`document_versions`/`document_notes` + 4 RPCs), **referrals** (`referral_codes`/`referral_credits`), **disputes** (`disputes`), **admin payout-batch + refund** (`payout_batches`, `run_weekly_payout_batch`, `refundBooking` server-fn), **mentor reviews-received** (mentor never sees their own ratings), and the **slot-hold** booking path (`reserve_slot`/`claim_reserved_booking`/`release_reserved_booking`).
- **Child-safety / safeguarding gaps** (highest stakes): the **mentor code-of-conduct / safeguarding training is never written** — `mentors.code_of_conduct_accepted_at`, `mentor_training_completions`, and `mentor_training_complete()` are all scaffolded, yet the approval email already promises this training as a pre-first-session gate; **`safeguarding_events`** (PII-block / block incidents) has no admin surface; the mentor **18+ age gate is client-only** (the trigger parses DOB but never rejects an under-18 mentor). Student minor-status is correctly *derived* (`requires_consent_base`), not stored; parental consent is correctly **guardian-side** (`/parental-consent/$token`), not self-served at signup.
- **Legal acceptance is captured but never surfaced**: `legal_acceptances` (terms/privacy/mentor_agreement) is written by the signup trigger but never read back — no "agreements you've accepted" panel; `mark_consent_revoked` (revoke parental consent) is unwired.
- **Only 3 genuine fakery items** (list B), and all are small wiring/coverage gaps, not fabricated data — the surfaces are honest. Notably a **fake unconditional "verified" badge** on student "My Plugs" cards.

---

# 1. Student signup

The student signup surface is split across two routes and a finalize replay:

- **Pre-auth wizard** — `src/routes/student-signup.tsx` → `src/components/student-signup/SignupWizard.tsx`. A 10-step (9 for adults) wizard. Scalar fields ride in the `supabase.auth.signUp({ options: { data } })` metadata (SignupWizard.tsx:206-227); the rich join-table selections are stashed on-device via `saveProfileDraft` (SignupWizard.tsx:203) and replayed later.
- **Trigger** — `public.handle_new_user()` reads that metadata and INSERTs the `students` row + `legal_acceptances` rows. The authoritative body is the most-recent redefinition, `supabase/migrations/20260603000005_p2_mentor_schema.sql` (it still reads `board`/`bio`/`date_of_birth`/`parent_email`/`parent_phone`/`terms_version`/`privacy_version`; the earlier P1 body in `20260603000004_p1_student_schema.sql:311-476` is identical for the student branch).
- **Authenticated finalize** — `src/routes/student-signup_.finalize.tsx` → `src/components/student-signup/FinalizeProfile.tsx`. Writes the six owner-RLS join tables via `writeRichProfile` (profileWrite.ts:28-95), uploads the photo and sets `students.photo_url` directly (FinalizeProfile.tsx:97-111), then stamps completion via `finalize_student_profile()` (profileWrite.ts:99).

### Captured fields

| Step | Field | Written to (column / RPC / server-fn) | WIRED / SCAFFOLDED |
|------|-------|----------------------------------------|--------------------|
| basics | Full name | `signUp.data.full_name` → `handle_new_user` → `students.full_name` (SignupWizard.tsx:214) | WIRED |
| basics | Email | `signUp(email)` + `signUp.data` (implicit) → `students.email` (SignupWizard.tsx:207) | WIRED |
| basics | Phone | `signUp.data.phone` → `students.phone` (SignupWizard.tsx:215) | WIRED |
| basics | Date of birth | `signUp.data.date_of_birth` → `students.date_of_birth` (SignupWizard.tsx:218; trigger 20260603000005:99-106) | WIRED |
| basics/consent | Parent email | `signUp.data.parent_email` (only when `needsConsent`) → `students.parental_consent_email` (SignupWizard.tsx:219) | WIRED |
| basics/consent | Parent phone | `signUp.data.parent_phone` (only when `needsConsent`) → `students.parent_phone` (SignupWizard.tsx:220) | WIRED |
| school | School name | `signUp.data.school` → `students.school` (SignupWizard.tsx:216; `SchoolTypeahead` is lenient free-text, suggestion-only) | WIRED |
| school | Examination board | `signUp.data.board` → `students.board` (SignupWizard.tsx:221) | WIRED |
| school | Subjects | stash → `writeRichProfile` upsert → `student_subjects.subject_id` (profileWrite.ts:30-36) | WIRED |
| grade | Grade | `signUp.data.grade` → `students.grade` (SignupWizard.tsx:217) | WIRED |
| universities | Target universities | stash → insert → `student_schools(name, category='target', ref_university_id)` (profileWrite.ts:66-76) | WIRED |
| universities | Target countries | `signUp.data.countries` → `students.countries` (SignupWizard.tsx:217) | WIRED |
| courses | Courses | stash → upsert → `student_courses.course_id` (profileWrite.ts:37-43) | WIRED |
| sports | Sports | stash → upsert → `student_sports.sport_id` (profileWrite.ts:44-50) | WIRED |
| beyond | Co-curriculars | stash → upsert → `student_cocurriculars.cocurricular_id` (profileWrite.ts:51-57) | WIRED |
| beyond | Projects (category + title + description) | stash → insert → `student_project_categories(project_category_id, detail)` — title+description concatenated into one `detail` (profileWrite.ts:81-90) | WIRED |
| about | Short bio | `signUp.data.bio` → `students.bio` (SignupWizard.tsx:222); fresh-collection fallback also `update students.bio` (FinalizeProfile.tsx:131) | WIRED |
| account | Password | `supabase.auth.signUp(password)` → `auth.users` (SignupWizard.tsx:208) | WIRED |
| account | Terms version | `signUp.data.terms_version = LEGAL_VERSION` → `legal_acceptances(doc_type='terms', version)` (SignupWizard.tsx:223; trigger 20260603000005:204-206) | WIRED |
| account | Privacy version | `signUp.data.privacy_version = LEGAL_VERSION` → `legal_acceptances(doc_type='privacy', version)` (SignupWizard.tsx:224; trigger 20260603000005:208-210) | WIRED |
| (finalize) | Profile photo | upload to `student-photos` bucket + `update students.photo_url = path` (FinalizeProfile.tsx:101-110) | WIRED |
| (finalize) | Unresolved ref items | `create_ref_add_request(kind, name)` best-effort (profileWrite.ts:21-25, refClient.ts:36-44) | WIRED |
| (finalize) | Completion stamp | `finalize_student_profile()` → `students.profile_completed_at` (profileWrite.ts:99; RPC 20260604000100:56-94) | WIRED |

Consent token + initial parent email are produced **server-side, automatically**: the wizard sends DOB + parent contact in metadata; `handle_new_user` mints `students.parental_consent_token` when `requires_consent_base(dob, grade)` (20260603000005:111-128), and the AFTER INSERT trigger `students_request_parental_consent_email` fires the first consent email (20260530000002:241-269). The wizard never calls a consent RPC itself.

### Missing captures

- **date_of_birth / age / is_minor** — DOB **is** captured (`dob` state, SignupWizard.tsx:96, written to `students.date_of_birth`), and is required + validated (SignupWizard.tsx:152-154). There is no `age` or `is_minor` column — minor status is **derived live**, never stored (`requires_consent_base`, 20260530000002:44-53; booking gate `prevent_booking_minor_no_consent`). The client mirrors this with `consentRequired`/`isUnder18` (constants.ts:17-19) only to decide whether to show the consent step. So minor-status is correctly NOT a missing capture — it is deliberately stateless.
- **Parental consent (guardian vs student)** — Neither `record_parental_consent` nor `request_parental_consent` is called anywhere in the signup flow. `record_parental_consent` is invoked **only** by the GUARDIAN-side route `src/routes/parental-consent.$token.tsx:42` (the parent clicks the email link; the token is the auth, and a logged-in student calling it for their own row is rejected — 20260604000060:92-94). `request_parental_consent` is invoked **only** by the student dashboard resend banner `src/components/consent/AwaitingConsentNotice.tsx:36` (used post-signup on `dashboard.index.tsx:42`, `mentor.$id.tsx:355`, `browse.tsx:237`), not at signup. The wizard has a "Consent" **step** (SignupWizard.tsx:555-601), but it only collects/confirms parent contact and shows informational copy — it does NOT record consent. This is correct by design: the student cannot self-consent; the parent does so out-of-band. So "no consent RPC in signup" is expected, not a gap.
- **Terms-of-service acceptance at signup** — WRITTEN. `legal_acceptances` is populated via the `terms_version`/`privacy_version` metadata keys (SignupWizard.tsx:223-224) consumed by `handle_new_user` (20260603000005:204-210). It is never written directly from `src/` (no `supabase.from("legal_acceptances")` insert exists) — the trigger is the sole writer at signup. Note: the wizard records **`terms` and `privacy`** but NOT a separate code-of-conduct acceptance.
- **`students.code_of_conduct_accepted_at`** — NOT populated by the student signup flow. The column exists (types.ts:1553) but is grepped only in `types.ts` for the students table; no student-signup code writes it. (It is conceptually the mentor code-of-conduct field; for students it is left NULL.)
- **`students.first_session_used`** — NOT touched by signup (DB DEFAULT `false`; types.ts:1558). Set elsewhere by the free-first-session/booking flow, not signup. Correctly out of scope for signup.
- **`students.parental_consent_at`** — NOT (and must not be) written at signup; it is the consent flag the guardian path sets later (column-locked away from the client, 20260604000060:39-44).
- **`students.parental_consent_token`** — minted by the trigger, never written by client; also unreadable by the client by grant (20260604000060:50-55). Correct.

No student-signup field is fake or hardcoded: every input maps to a real column, RPC, or join-table write. The only deliberately-unwritten students columns are the consent-state columns (set by the guardian/booking flows) and `code_of_conduct_accepted_at`/`first_session_used`.

---

# 2. Mentor signup

The mentor signup is a two-phase flow:

1. **Pre-auth wizard** (`/mentor-signup` → `MentorSignupWizard.tsx`): 6 steps. All scalar fields ride in `supabase.auth.signUp({ options.data })` metadata (`MentorSignupWizard.tsx:158-181`), which the `handle_new_user()` trigger reads at the row INSERT (`20260603000005_p2_mentor_schema.sql:301-368`). The admits list + specialty are stashed on-device (`saveMentorDraft`, `draft.ts`) for the authenticated replay.
2. **Authenticated finalize** (`/mentor-signup/finalize` → `FinalizeMentor.tsx`): uploads the college-ID photo (+ enhanced-track enrollment proof + per-admit proofs) to the private `mentor-documents` bucket, replays admits into `mentor_admits`, then calls `submit_mentor_application()`.

A third route, `/mentor-terms` (`mentor-terms.tsx`), renders the Mentor/Contractor Agreement markdown as a read-only `LegalDocument` — it captures nothing.

### Captured fields

| Step | Field | Written to (column / RPC / server-fn) |
| --- | --- | --- |
| 1 Identity | Full name | `mentors.full_name` via signup metadata `full_name` → `handle_new_user` (`MentorSignupWizard.tsx:166`, `p2_mentor_schema.sql:217,361-368`) |
| 1 Identity | Date of birth | `mentors.date_of_birth` via metadata `date_of_birth` → `handle_new_user` defensively parses (`MentorSignupWizard.tsx:174`, `p2_mentor_schema.sql:330-337,363-367`). Client also enforces 18+ via `isUnder18` (`MentorSignupWizard.tsx:113`) |
| 1 Identity | College email | `mentors.college_email` via metadata `college_email` → `handle_new_user` (`MentorSignupWizard.tsx:172`, `p2_mentor_schema.sql:322,363`). ALSO derives `mentors.tier` server-side via `set_mentor_tier` BEFORE-INSERT trigger calling `validate_college_email` (`20260606000003_p2_mentor_email_gate.sql:87-101`). Also the auth login email. |
| 1 Identity | Phone | `mentors.phone` via metadata `phone` → `handle_new_user` (`MentorSignupWizard.tsx:171`, `p2_mentor_schema.sql:321,363`) |
| 2 Study | University (label) | `mentors.university` via metadata `university` (`MentorSignupWizard.tsx:167`, `p2_mentor_schema.sql:302,362`) |
| 2 Study | University (canonical id) | `mentors.ref_university_id` via metadata `university_id`, validated → NULL if unknown (`MentorSignupWizard.tsx:168`, `p2_mentor_schema.sql:341-349,363`) |
| 2 Study | Year of study | `mentors.year` via metadata `year` (`MentorSignupWizard.tsx:170`, `p2_mentor_schema.sql:304,362`) |
| 2 Study | Course (label) | `mentors.course` via metadata `course` (`MentorSignupWizard.tsx:169`, `p2_mentor_schema.sql:303,362`) |
| 2 Study | Course (canonical id) | `mentors.ref_course_id` via metadata `course_id`, validated → NULL if unknown (`MentorSignupWizard.tsx:169`, `p2_mentor_schema.sql:351-359,363`) |
| 3 Admits | Universities admitted to | `mentor_admits` rows (mentor_id + ref_university_id + nullable proof_path) via `writeMentorAdmits` upsert in finalize (`mentorWrite.ts:55-71`, `FinalizeMentor.tsx:135`). Unresolved (no ref id) → `createRefAddRequest("university", …)` instead. |
| 4 Specialty | Specialty key | `mentors.specialty_id` via metadata `specialty` → `handle_new_user` resolves key→`ref_specialties.id` (`MentorSignupWizard.tsx:175`, `p2_mentor_schema.sql:325-328,363`) |
| 5 Bio | Bio | `mentors.bio` via metadata `bio` (`MentorSignupWizard.tsx:173`, `p2_mentor_schema.sql:323,367`) |
| 6 Account | Password | Supabase Auth (`auth.users`) via `signUp` (`MentorSignupWizard.tsx:159-160`) |
| 6 Account | Agree ToS (checkbox) | `legal_acceptances` (doc_type `terms`, version `1.0`) via metadata `terms_version` → `handle_new_user` (`MentorSignupWizard.tsx:176`, `p2_mentor_schema.sql:373-376`) |
| 6 Account | Agree Privacy (checkbox) | `legal_acceptances` (doc_type `privacy`) via metadata `privacy_version` (`MentorSignupWizard.tsx:177`, `p2_mentor_schema.sql:377-380`) |
| 6 Account | Agree Mentor Agreement (checkbox) | `legal_acceptances` (doc_type `mentor_agreement`) via metadata `mentor_agreement_version` (`MentorSignupWizard.tsx:178`, `p2_mentor_schema.sql:381-387`) |
| Finalize | College-ID photo (required) | `mentors.id_document_path` + file in `mentor-documents` bucket via `uploadMentorDocument`+`setMentorIdDocument` (`FinalizeMentor.tsx:118-119`, `mentorWrite.ts:13-35`) |
| Finalize | Enrollment proof (enhanced track, required) | `mentors.enrollment_letter_path` + file in `mentor-documents` via `setMentorEnrollmentDocument` (`FinalizeMentor.tsx:122-125`, `mentorWrite.ts:39-45`). Server-enforced for `tier='enhanced'` in `submit_mentor_application` (`p2_mentor_email_gate.sql:199-201`) |
| Finalize | Per-admit acceptance proofs (optional) | `mentor_admits.proof_path` + file in `mentor-documents` (`FinalizeMentor.tsx:128-135`, `mentorWrite.ts:58-66`) |
| Finalize | Submit | `mentors.application_submitted_at = now()` via `submit_mentor_application()` RPC, requires id_document_path present (`mentorWrite.ts:74-77`, `FinalizeMentor.tsx:137`, `p8_mentor_application_submit.sql:128-161`) |
| Resubmit (rejected) | Optional ID re-upload + resubmit | `mentors.id_document_path` + `resubmit_mentor_application()` (rejected→pending) via `MentorStatusScreens.tsx:74-78`, `mentorWrite.ts:80-83` |

### Missing captures

- **date_of_birth — CAPTURED.** Unlike a question of "is it captured," for mentors it IS: M1 collects DOB, validates 18+ client-side (`MentorSignupWizard.tsx:107-115`), ships it in metadata (`:174`) and `handle_new_user` writes `mentors.date_of_birth` (`p2_mentor_schema.sql:330-337,363-367`). Note the 18+ gate is **client-only** — `handle_new_user` does not re-assert age server-side (it parses DOB but never rejects an under-18 mentor), and `mentors.date_of_birth` is then frozen by `prevent_mentor_identity_tamper` (`20260611000003_p10e_mentor_identity_lock.sql:69`). No parental-consent machinery applies (mentors are adults) — `parental_consent_records`/`record_parental_consent`/`request_parental_consent` are student-only and correctly not invoked here.

- **Terms-of-Service acceptance via legal_acceptances — WIRED.** The three M6 checkboxes are real captures: each agreed version flows through signup metadata into `legal_acceptances` rows (terms/privacy/mentor_agreement) written by `handle_new_user` (`p2_mentor_schema.sql:373-387`). The `legal_acceptances.doc_type` CHECK allows exactly `terms`/`privacy`/`mentor_agreement` (`p1_student_schema.sql:246`). Caveat: the checkbox→`legal_acceptances` link is implicit — the client only sends version strings unconditionally; there is no foreign-key proof the user actually ticked the box (validation blocks Submit if unchecked, `MentorSignupWizard.tsx:125-126`, but the metadata versions are sent regardless).

- **Mentor code-of-conduct acceptance — NOT WRITTEN ANYWHERE. Backend exists, signup does not touch it.** `mentors.code_of_conduct_accepted_at` exists (`g_schema_bulk.sql:228-229`) and `mentor_training_completions` + `mentor_training_complete(uuid)` (sections `safeguarding`, `code_of_conduct`) exist (`g_schema_bulk.sql:177-216`). Grep across `src/` finds NO write to `mentors.code_of_conduct_accepted_at` and NO write to `mentor_training_completions` (only the data-export server-fn reads it: `src/lib/me/export.functions.ts:98`). The "Mentor / Contractor Agreement" checkbox in M6 maps to `legal_acceptances` doc_type `mentor_agreement` — it is NOT the code-of-conduct. `mentor-terms.tsx` is **display-only** (`mentor-terms.tsx:13` renders `<LegalDocument>`, no mutation, no `legal_acceptances` insert, no `code_of_conduct_accepted_at` write). The approval email even tells the mentor "complete the safeguarding + code-of-conduct training (required before your first session)" (`src/lib/email/templates.ts:312`), but there is no training/onboarding route or UI to do so (no `mentor-train*`/`conduct` route exists). This is a real gap for a minor-serving platform: `mentor_training_complete()` is documented as the gate the admin approval flow should check, but it can never become true because nothing writes the completion rows.

- **Mentor verification-document upload — WIRED (this is the core of the finalize step).** The signup DOES let a mentor upload an enrollment/ID proof. Storage: the private `mentor-documents` bucket with per-uid prefix RLS (`f1_mentor_verification.sql:90-117`); columns `mentors.id_document_path` + `mentors.enrollment_letter_path` (`f1_mentor_verification.sql:44-49`). UI: `FinalizeMentor.tsx` uploads the college-ID photo (required, `:118-119`,`:176-201`), the enrollment proof for the enhanced track (`:122-125`,`:205-232`), and optional per-admit proofs (`:128-135`,`:234-283`); `mentorWrite.ts:13-45` is the upload + column-set helper. The enhanced-track enrollment-proof requirement (P2 email gate) is enforced both client-side (`FinalizeMentor.tsx:105-110`) and server-side/data-layer (`p2_mentor_email_gate.sql:145,163,199-201`). Admin review reads these via signed URLs in `src/lib/admin/mentor-verification.functions.ts:39-61`.

**Net:** 18 wired captures across wizard + finalize; the only genuinely missing capture is the mentor **code-of-conduct / safeguarding training** acceptance — the backend (`code_of_conduct_accepted_at`, `mentor_training_completions`, `mentor_training_complete`) is fully scaffolded and even referenced in the approval email copy, but no signup/onboarding UI writes it.

---

# 3. Student dashboard

The student dashboard is a nested-route shell (`src/routes/dashboard.tsx`) with an auth guard (`requireRole: "student"`), a persistent sidebar/topbar/mobile-nav, and four child routes plus several standalone student-facing routes reachable from the nav. The shell resolves `userId` once and passes it through `DashboardContext` to every section. Below, each element is traced to its actual query and classified WIRED (a section reads/writes it, with file:line) or SCAFFOLDED (backend exists in migrations/types but no student UI touches it).

### sessions / bookings
| Element | Backing (table.column / RPC / server-fn) | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Upcoming sessions list | `bookings` (status='confirmed', date>=today) | WIRED | `UpcomingSessionsSection.tsx:62-72`; explicitly selects only safe columns, never `select(*)` (avoids razorpay_*/payout_id leak) |
| Mentor display names | `get_mentor_booking_names(_ids)` RPC | WIRED | `UpcomingSessionsSection.tsx:88`; returns id+full_name+university |
| Cancel session (+ refund tier) | `cancel_booking_as_student(_booking_id)` RPC | WIRED | `UpcomingSessionsSection.tsx:188`; returns `{tier, refundable_inr, captured_inr}` |
| Reschedule session | `reschedule_booking(_booking_id,_new_date,_new_time_slot)` RPC | WIRED | `UpcomingSessionsSection.tsx:320`; lead-time/cap mirrored in UI, RPC is authority |
| Available slots for reschedule | `get_mentor_calendar(_mentor_id)` RPC | WIRED | `UpcomingSessionsSection.tsx:288` |
| Join call | route `/call/$bookingId` | WIRED | `UpcomingSessionsSection.tsx:148-153` (link only; call surface separate) |
| Past sessions list | `bookings` (status='completed') | WIRED | `PastSessionsSection.tsx:42-47` |
| My Plugs (confirmed mentors) | `bookings` (status='confirmed') + `get_mentor_booking_names` | WIRED | `MyPlugsSection.tsx:18-31`; groups only confirmed bookings |

### document vault
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| List documents | `student_documents` (id,file_name,storage_path,size_bytes,created_at) | WIRED | `MyDocumentsSection.tsx:42-48` |
| Upload | storage `student-documents` + `student_documents` insert | WIRED | `MyDocumentsSection.tsx:94-110`; PDF/DOC/DOCX, 10MB |
| Delete | storage remove + `student_documents` delete | WIRED | `MyDocumentsSection.tsx:53-55` |
| Share doc with mentor | `share_student_document` RPC | SCAFFOLDED | RPC exists (`20260604000010_a_document_sharing.sql:174`); zero src/ callers |
| Document versions / notes | `add_document_version`, `add_document_note`, `document_versions`, `document_notes` | SCAFFOLDED | Full backend (`20260604000010...:204-228`); no student UI |

### schools
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| My Schools (dream/target/safety) | `student_schools` (name,category,ref_university_id) | WIRED | `MySchoolsWidget.tsx:40-117`; full owner-RLS CRUD + tier change |
| School typeahead / request-to-add | `RefMultiSelect` over universities ref + `createRefAddRequest` | WIRED | `MySchoolsWidget.tsx:121-131` |

### session notes & action points
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Session notes feed | `session_notes` (summary, action_points JSON) | WIRED | `SessionNotesSection.tsx:32-37`; also `/session-notes`, `/progress` |
| Action-point completion toggle | `action_point_completions` upsert (onConflict session_note_id,action_point_index) | WIRED | `SessionNotesSection.tsx:111-120`; mirrored in progress.tsx:143 |
| `session_action_points` (legacy table) | `session_action_points` | SCAFFOLDED | Frontend moved to `session_notes.action_points` JSON; migration `20260514100001:57` notes pending drop |
| Single-note view | `session_notes` by id | WIRED | `session-notes.$noteId.tsx:89` |

### reviews / ratings
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Leave a review (1-5 + text) | `reviews` insert (student_id,mentor_id,rating,review) | WIRED | `ReviewForm.tsx:82-87`, opened from `PastSessionsSection.tsx:196-204`; RLS requires a completed booking |
| Has-reviewed gate | `reviews` select by student_id | WIRED | `PastSessionsSection.tsx:67`; flips CTA to "Reviewed" |

### profile
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Basic details (name/phone/school/board/countries/bio) | `students` allowlisted cols | WIRED | `profileEdit.ts:75-90` (consent_column_lock allowlist) |
| Profile photo | storage `student-photos` + `students.photo_url` | WIRED | `profileEdit.ts:105-129` (delete+insert) |
| Date of birth | `students.date_of_birth` | WIRED (read-only) | `ProfileSection.tsx:285-292`; frozen by `students_dob_immutable` trigger |
| Interests (subjects/courses/sports/cocurriculars) | `student_subjects/courses/sports/cocurriculars` + ref join | WIRED | `profileEdit.ts:148-277` |
| Target universities | `student_schools` (category='target') | WIRED | `profileEdit.ts:281-317` |
| Projects | `student_project_categories` (project_category_id,detail) | WIRED | `profileEdit.ts:330-366` |
| `code_of_conduct_accepted_at` | `students.code_of_conduct_accepted_at` | SCAFFOLDED | Column on students (types.ts:464); editor never writes/surfaces it |

### notifications
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Notifications list | `notifications` (recipient_id) | WIRED | `notifications.tsx:113-118` |
| Mark one / all read | `notifications.read_at` update | WIRED | `notifications.tsx:131-159` |
| Unread bell badge | `notifications` count head | WIRED | `DashboardTopbar.tsx:30-37` |

### messaging
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Conversation list | `getMyConversations` (chat api) | WIRED | `messages.tsx:67`, `messages_.$conversationId.tsx` |
| Thread / compose | chat api `Thread` + realtime | WIRED | `messages.tsx:87`; entry via `?peer=` from UpcomingSessionsSection.tsx:139 |
| Incoming-message refresh | `useIncomingMessageRefresh` | WIRED | `DashboardTopbar.tsx:20` |

### AI features (prep questions / matching)
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Session prep questions | `generatePrepQuestions` server-fn → `session_prep_questions` (booking_id, questions, source) | WIRED | UI `UpcomingSessionsSection.tsx:456-519`; server-fn `prep-questions.functions.ts:69`, caches in `session_prep_questions` |
| Top picks / mentor match | `generateMatchSuggestions` server-fn → `mentor_match_suggestions` (student_id, generated_on, suggestions) | WIRED | UI `TopPicksSection.tsx:29-104`; server-fn `match.functions.ts:45`; enriched via `list_approved_mentor_profiles` |
| Profile-completeness gate for matches | `students` (grade,school,countries) | WIRED | `TopPicksSection.tsx:63-74` |

### settings / account data (export + delete)
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Export my data | `exportMyData` server-fn | WIRED | `AccountDataSection.tsx:39`; dumps students + bookings/reviews/notes/etc as JSON |
| Delete my account | `deleteMyAccount` server-fn (confirm 'DELETE-MY-ACCOUNT') | WIRED | `AccountDataSection.tsx:68`; cascading auth+storage delete |

### verification / safeguarding
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Awaiting-consent notice + resend | `request_parental_consent(_student_id)` RPC | WIRED | `AwaitingConsentNotice.tsx:36`, rendered `dashboard.index.tsx:41-43` |
| Consent status signal | `students` (date_of_birth, grade, parental_consent_at, parental_consent_email) | WIRED | `useConsentStatus.ts:33-37` |
| `parental_consent_records` audit | `parental_consent_records` (written by `record_parental_consent`) | SCAFFOLDED | Immutable audit (`20260530000001:59`); never read by student dashboard |

### payments / refunds-as-student
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Cancellation refund tier + amount | `cancel_booking_as_student` return `{refundable_inr}` | WIRED | `UpcomingSessionsSection.tsx:201-205` — the only student-facing money surface |
| Refund/payment history view | none | SCAFFOLDED | `payments_1b_ledger` exists but no student ledger/receipts UI; bookings.razorpay_* deliberately never selected client-side |

### referrals
| Element | Backing | WIRED / SCAFFOLDED | Notes |
|---|---|---|---|
| Referral code / credits | `referral_codes`, `referral_credits` | SCAFFOLDED | Only appear in the export dump (`export.functions.ts:80-87`); no generate/redeem RPC, no UI |

**WIRED: 38 elements. SCAFFOLDED: 9 elements.**

---

# 4. Mentor dashboard

Routes: `src/routes/mentor-dashboard.tsx` (layout shell + auth guard + application-status gate), and nested children `mentor-dashboard.index.tsx` (Home), `.schedule.tsx`, `.earnings.tsx`, `.students.tsx`, `.students_.$studentId.tsx` (per-student page), `.settings.tsx`. Sections under `src/components/mentor-dashboard/sections/`. Shared shell: `MentorSidebar.tsx`, `MentorMobileNav.tsx`, `MentorDashboardContext.tsx`, `DashboardTopbar` (role="mentor"). All children mount only for a signed-in, role=mentor, status=approved account; non-approved states render `UnderReviewScreen` / `RejectedScreen` (`mentor-dashboard.tsx:136-154`).

### Shell / gating
| Element | Backing (table.column / RPC / server-fn) | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Mentor header (name, status, submitted-at, reason) | `mentors.full_name/status/application_submitted_at/verification_notes` | WIRED | `mentor-dashboard.tsx:87-99` |
| "Profile live but can't be booked" nudge | `mentor_availability` count head-query | WIRED | `mentor-dashboard.tsx:106-112`; banner `:166-185` |
| Application gate → review / rejected / finalize redirect | `mentors.status`, `application_submitted_at` | WIRED | `mentor-dashboard.tsx:122-154`; rejected→`RejectedScreen` |
| Re-review / resubmit | `resubmit_mentor_application` RPC (via `resubmitMentorApplication`) | WIRED | `MentorStatusScreens.tsx:78,129` (lives in mentor-signup, reused as the gate) |

### Sessions / bookings
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Upcoming sessions list | `get_my_bookings_as_mentor()` RPC (P10a, `20260611000001:70`) | WIRED | `MentorUpcomingSessions.tsx:61`; filters confirmed + not-ended client-side |
| Student names on sessions | `get_student_booking_names(_ids)` RPC | WIRED | `MentorUpcomingSessions.tsx:79` |
| Mentor-initiated cancel (full refund + accrual clawback) | `cancel_booking_as_mentor(_booking_id)` RPC (`20260604000050:289`) | WIRED | `MentorUpcomingSessions.tsx:267`; optimistic, invalidates earnings/schedule |
| Mentor-initiated **reschedule** | `reschedule_booking(...)` RPC (`20260603000008:43`) | SCAFFOLDED | RPC exists + GRANTed, but no mentor UI calls it (only student-side); no reschedule control in any mentor section |
| Join call | route `/call/$bookingId` | WIRED | `MentorUpcomingSessions.tsx:175` |

### Availability
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Weekly grid (slots + booked cells) | `mentor_availability.day_of_week/start_hour` (SELECT) | WIRED | `ScheduleSection.tsx:44-49` |
| Toggle slot (add/remove) | `mentor_availability` INSERT/DELETE | WIRED | `ScheduleSection.tsx:116-127`; optimistic |
| Week bookings overlay | `bookings` (date/time/student) + `get_student_booking_names` | WIRED | `ScheduleSection.tsx:62-82` |

### Earnings / payouts
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Summary cards (pending/scheduled/paid/lifetime/clawback/count) | `get_mentor_earnings()` RPC over immutable `payment_ledger.mentor_share_inr` + `mentor_payouts` (P10c, `20260611000002:39`) | WIRED | `EarningsSection.tsx:78`; **no hardcoded numbers** — all from RPC summary |
| Next payout date | `get_mentor_earnings().next_payout_date` (min scheduled `mentor_payouts.payout_date`) | WIRED | `EarningsSection.tsx:101,127` |
| Per-session earnings table | `get_mentor_earnings().sessions[]` | WIRED | `EarningsSection.tsx:99,176-184` |
| Payout-batch history table | `mentor_payouts` (id, amount_inr, status, payout_date, period_end) RLS auth.uid()=mentor_id | WIRED (read-only) | `EarningsSection.tsx:84-88`; allowlisted columns, no select(*) |
| `payout_batches` table | `payout_batches` (weekly run rows) | SCAFFOLDED | No src read; mentor only sees its own `mentor_payouts`; batch creation is `run_weekly_payout_batch` (service_role/worker only) |
| Trigger/disburse payout from UI | `run_weekly_payout_batch` (service_role) | SCAFFOLDED (intentional) | No mentor or admin UI; V1 disbursement deferred, accruals sit `scheduled` |

### My students
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Roster (count + last session) | `bookings.student_id/date` (status in confirmed/completed) + `get_student_booking_names` | WIRED | `MyStudentsSection.tsx:27-44` |
| Per-student overview (name/grade/school/docs/schools) | `get_student_overview_for_mentor(_student_id)` RPC (gated on active booking, `20260603000006:31`) | WIRED | `MentorUpcomingSessions.tsx:101` (modal) + `students_.$studentId.tsx:77` (full page); doubles as not-found gate |
| `get_mentor_booking_names` RPC | `get_mentor_booking_names(_ids)` | SCAFFOLDED (for this surface) | RPC exists + used in the STUDENT dashboard, but the mentor dashboard never calls it (mentor needs student names, not mentor names) |

### Session notes & action points
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Past-session picker | `bookings` (allowlisted cols, status confirmed/completed, ended) | WIRED | `PostSessionNotesSection.tsx:60-68` |
| Save/edit note (summary + action points) | `session_notes` (summary, `action_points` jsonb array, booking_id, mentor_id, student_id) INSERT/UPDATE | WIRED | `PostSessionNotesSection.tsx:204-224` |
| Previous-notes list / view / edit deep-link | `session_notes` SELECT + `get_student_booking_names` + `bookings` | WIRED | `:105-156`; "View" → `/session-notes/$noteId` |
| Action-point creation | `session_notes.action_points` (jsonb array on the note) | WIRED | Mentors author action points as bullets inside the note (`:351-374`) |
| `session_action_points` (separate normalized table) | `session_action_points` table (content/position/note_id) | SCAFFOLDED | Table exists in types + early migrations; the app uses `session_notes.action_points` jsonb instead — no src read/write of the table anywhere |
| Action-point completion display (per-student page) | `action_point_completions` (session_note_id, action_point_index, completed) SELECT | WIRED (read-only here) | `students_.$studentId.tsx:116`; mentor sees student-ticked progress (writes happen student-side) |
| AI "Expand notes" → student-ready draft | `expandSessionNote` server-fn (`note-expansion.functions.ts`), Claude, rate-limited, NOT persisted | WIRED | `PostSessionNotesSection.tsx:8,245`; drops draft into summary for review |
| AI "Prepare for session" (prep questions) | `generatePrepQuestions` server-fn (`prep-questions.functions.ts`) | SCAFFOLDED (for mentor) | server-fn exists but is called only in the STUDENT `UpcomingSessionsSection.tsx:8,458`; no mentor-side caller |

### Private notes
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Mentor-only private note per student (read/save/delete) | `mentor_private_notes` (body, mentor_id, student_id) SELECT/INSERT/UPDATE/DELETE | WIRED | `students_.$studentId.tsx:101-178` |

### Reviews / ratings received
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Reviews received display inside the mentor dashboard | `reviews` (rating, review, mentor_id) | SCAFFOLDED (for this surface) | `reviews` is read only on the PUBLIC profile `mentor.$id.tsx:103` and written by students (`ReviewForm.tsx:82`); the mentor dashboard never shows the mentor their own incoming ratings/reviews or an average |

### Profile
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Load/save editable profile (bio, topics, photo_url, phone) | `mentors.bio/topics/photo_url/phone` via `loadMentorProfile`/`saveMentorProfile` allowlist | WIRED | `SettingsSection.tsx` + `mentorProfileEdit.ts:40-71` |
| Profile photo upload | `mentor-photos` storage bucket | WIRED | `SettingsSection.tsx:89-93`; image-type + 5MB guard client-side |
| Identity-column lock (verified identity / capacity / doc paths) | trigger `prevent_mentor_identity_tamper` (`20260611000003:43`) + `prevent_mentor_self_approval` | WIRED (enforced) | The editor stays inside the safe allowlist so saves never trip the triggers; triggers are the real DB boundary |

### Notifications
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Bell unread badge (topbar) | `notifications` count (recipient_id=auth.uid()) | WIRED | `DashboardTopbar.tsx:24-31`, role-agnostic, mounted in mentor shell |
| Notifications list / mark-read | `notifications` SELECT/UPDATE (mentor-facing copy branch) | WIRED | shared route `/notifications` (`notifications.tsx`), mentor copy at `:184-189,297` |

### Messaging
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Messages entry (sidebar + per-session "Message") | `/messages?peer=&peerName=` route (shared, role-aware) | WIRED | `MentorSidebar.tsx:26`, `MentorUpcomingSessions.tsx:162-167`; thread reads conversations/messages with role="mentor" |

### Verification / safeguarding
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| `mentor_training_completions` (safeguarding + code_of_conduct) | table + `mentor_training_complete(uuid)` RPC (`20260523000007:177`) | SCAFFOLDED | No UI reads/writes/displays training anywhere in src (only in GDPR export/delete fns); admin approval is meant to gate on it, but mentor has no training surface |
| Status / re-review surfacing | `mentors.status`, `verification_notes`, `resubmit_mentor_application` | WIRED | via the gate screens (see Shell) |

### Settings (account)
| Element | Backing | WIRED / SCAFFOLDED | Notes |
| --- | --- | --- | --- |
| Export my data | `exportMyData` server-fn (branches on role) | WIRED | `AccountDataSection.tsx:39` |
| Delete my account | `deleteMyAccount` server-fn (hard cascade) | WIRED | `AccountDataSection.tsx:68` |
| Sign out | `supabase.auth.signOut()` | WIRED | `MentorSidebar.tsx:37` |

---

# A & B — cross-cutting gaps

## A. Backend-without-frontend

These backend elements exist in `supabase/migrations/*.sql` and `src/integrations/supabase/types.ts` but are surfaced or captured NOWHERE across student signup, mentor signup, student dashboard, and mentor dashboard. Each was adversarially re-grepped across all of `src/`; the only hits are in `types.ts` (generated) and, where noted, the GDPR export/delete server-fns (which dump rows but provide no operational UI).

### Legal / consent / child-safety
- **Table `legal_acceptances`** (`20260603000004_p1_student_schema.sql:246`) — written indirectly by the `handle_new_user` trigger from signup metadata, but NEVER `.from()`-read in src (only a comment hit `src/components/signup/constants.ts:4`). No surface ever shows or re-checks a user's ToS/privacy/mentor_agreement acceptance → implies an account-settings "your agreements & versions accepted" panel.
- **Table `parental_consent_records`** (`20260530000001:59`) — append-only consent audit, written only by `record_parental_consent` RPC; the table itself is never `.from()`-read in src → implies a guardian/admin consent-audit trail view.
- **RPC `record_parental_consent` is wired (guardian route) but `mark_consent_revoked`** (types.ts:2007) — never called in src → implies a "revoke parental consent" control for guardians/admins.
- **Column `students.code_of_conduct_accepted_at`** (`20260523000007_g_schema_bulk.sql:226`; types.ts:464) — only in types.ts, never written/read; absent from the `profileEdit.ts` allowlist → implies a student code-of-conduct acceptance gate.
- **Column `mentors.code_of_conduct_accepted_at`** (`20260523000007_g_schema_bulk.sql:229`; types.ts:1553) — never written/read in src (the M6 "Mentor Agreement" checkbox writes `legal_acceptances`, not this) → implies a mentor code-of-conduct/onboarding acceptance step.
- **Column `students.parent_phone`** (types.ts:1562) — WRITTEN at signup (`SignupWizard.tsx:220`) but never read back or made editable; explicitly excluded from the editable allowlist (`profileEdit.ts:79`) → implies a read-back/edit of guardian contact on the consent surface.

### Mentor training / safeguarding
- **Table `mentor_training_completions` + RPC `mentor_training_complete(uuid)`** (`20260523000007_g_schema_bulk.sql:177-216`; types.ts:434,2015) — no UI writes or surfaces training completion; only read by `export.functions.ts:98`. Approval email copy (`src/lib/email/templates.ts:312`) promises a training step that has no route → implies a mentor safeguarding/code-of-conduct training flow that the approval gate can check.
- **Table `safeguarding_events`** (`20260530000004_chat_messaging.sql`; types.ts:1135) — pii_blocked / student_blocked_mentor incidents written only by DB triggers; zero src reference → implies an admin safeguarding incident dashboard.
- **Column `mentors.re_review_pending`** (types.ts:479) — only a comment hit (`mentorProfileEdit.ts`); never read; its clearing RPC **`admin_clear_re_review`** (types.ts:1764) is also uncalled, while a `mentor_re_review_cleared` email type exists → implies an admin re-review queue + clear control.
- **Column `mentors.verified_by`** (types.ts:489) — never read in src (only `verified_at`/`verification_notes` are surfaced) → implies "verified by <admin>" provenance in admin/mentor views.
- **RPC `admin_set_mentor_status`** (types.ts:1744) — not called; admin uses `approve_mentor`/`reject_mentor` instead (`admin.tsx:283-284`) → implies a finer-grained status-management control.

### Document sharing (entirely scaffolded domain)
- **Tables `document_shares`, `document_notes`, `document_versions`** (`20260604000010_a_document_sharing.sql:48-70`) — zero src usage; `MyDocumentsSection` is upload/list/delete only → implies a "share document with mentor + versioned + mentor notes" feature.
- **RPCs `share_student_document`, `add_document_note`, `add_document_version`, `can_access_document`** (`20260604000010_a_document_sharing.sql:146-228`) — zero src callers → the operations behind the above feature.

### Referrals (entirely scaffolded domain)
- **Tables `referral_codes`, `referral_credits`** (types.ts:1037,1066) — only dumped in `export.functions.ts:80-87`; no generate/redeem RPC, no UI → implies a referral-code + credits feature.

### Disputes
- **Table `disputes`** (`20260523000007_g_schema_bulk.sql`; types.ts:183) — only dumped in `export.functions.ts:100`; no create/view/manage UI anywhere in src (confirmed: zero "dispute" hits outside types.ts/export) → implies a student/mentor dispute-raising + admin-resolution surface.

### Reviews received (mentor side)
- **Table `reviews` read on the mentor side** — `reviews` is written by students (`ReviewForm.tsx:82`) and read only on the PUBLIC profile (`mentor.$id.tsx:103`); the mentor dashboard never reads its own incoming ratings → implies a "reviews received / average rating" panel in the mentor dashboard.

### Booking lifecycle (unused alternate paths)
- **RPC `update_booking_status_as_mentor`** (types.ts:2046) — not called; mentor flows use `cancel_booking_as_mentor` → implies a mentor mark-complete/no-show control.
- **RPCs `reserve_slot`, `claim_reserved_booking`, `release_reserved_booking`** (types.ts:1855-1863) — the P4b slot-hold flow; none called in src → implies a slot-hold-during-checkout step in the booking picker.

### Payouts (worker-only, invisible to users)
- **Table `payout_batches`** (`20260531120003_payments_1c_payouts.sql`; types.ts:797) + **RPC `run_weekly_payout_batch`** (types.ts:2029) — written/run only by cron; zero src reference. `mentor_payouts.batch_id`/`cutoff_at`/`run_at` are never read (confirmed: zero hits) → implies an admin payout-batch run history / mentor "in this batch" view.
- **Server-fn `refundBooking`** (`src/lib/payments/refund.functions.ts:28`) — fully implemented admin refund path, imported NOWHERE in src → implies an admin refund/dispute action surface.

### Mentor capacity
- **Column `mentors.max_active_mentees`** (types.ts:475) — only comment hits in `mentorProfileEdit.ts`; never collected or enforced in any surface → implies a mentor self-set capacity cap control.

### Legacy (drop-candidates, listed for completeness)
- **Table `sessions`** (legacy, `20260425101339`) — superseded by `bookings`; zero `.from("sessions")` in src.
- **Table `session_action_points`** (legacy, `20260425101339`; types.ts:1162) — superseded by `session_notes.action_points` jsonb; zero src usage.

### Internal-only (correctly never src-called — noted, not redesign targets)
- **RPCs `is_approved_mentor`, `chat_contains_pii`, `notify_event_email`** — predicate/trigger helpers used only inside other RPCs/RLS; zero src calls confirmed. These are expected to be backend-internal and do NOT imply new UI.

---

## B. Frontend-without-backend

Verified by reading each cited file:line. Only genuine fake/placeholder/hardcoded cases are kept.

- **`MyPlugsSection.tsx:71-74` — fake "verified" badge.** Every plug card renders a `BadgeCheck` "verified" badge unconditionally. The card data comes from `get_mentor_booking_names` (`MyPlugsSection.tsx:28`), which returns only `id`, `full_name`, `university` — no verification/approval column is read. The badge is a static decoration not driven by any mentor verification state. (Confirmed by reading the select at `MyPlugsSection.tsx:18-31` and the badge JSX at `:71-74`.)

- **`PastSessionsSection.tsx:184-189` — "View notes" is a fragile in-page anchor, not a real per-note route.** The link is `href="#section-session-notes"` (`PastSessionsSection.tsx:185`), which only resolves on the `/dashboard/sessions` page that renders that anchor; from `/dashboard` (past-sessions home) it dead-ends. A real per-note route (`/session-notes/$noteId`) exists and is used elsewhere, so this is a wiring gap, not missing backend — kept because the surfaced control does not reliably reach the data it claims to.

- **`TopPicksSection.tsx:46-55` — surfaced match cards silently drop a real backend field.** `list_approved_mentor_profiles` returns `price_inr`, but the card mapper omits it; the student never sees the per-session price on a top-pick mentor. Not fake data, but a real-backend field that the surface advertises ("powers your mentor matches") yet does not display.

### Items reviewed and DROPPED (turned out to be backed or not fakery)
- **OAuth "social sign-in" (`SignupWizard.tsx:666-667`)** — this is only a layout comment; no fake button/UI is rendered. Not fakery. Dropped.
- **`FinalizeProfile.tsx:151-154` "Skip for now"** — sets a session-only skip flag and routes to `/dashboard` without calling `finalize_student_profile()`. Verified at `skipForNow()` (`FinalizeProfile.tsx:151-154`): selections are stashed and replayed on the next finalize visit (deferred, not lost or faked). It is a real, honest behavior — dropped from fakery, though it is a completion-gate UX risk worth noting.
- **`progress.tsx:179-184` / `session-notes.tsx:179-185` stat tiles** — verified to be client-side reductions over real `session_notes` + `action_point_completions` data. Backed, not hardcoded. Dropped.
- **EarningsSection "paid" bucket / "Paid out" badge** (`EarningsSection.tsx:130`) — real `mentor_payouts.status` column; always 0 in V1 because disbursement is deferred (accruals sit `scheduled`). Honest label over a real column, not fake. Dropped.
- **TopPicks "reason" text** (`match.functions.ts`) — real AI output from `mentor_match_suggestions.suggestions`; backed. Dropped.

---

# Appendix — backend reference

Source of truth precedence: (1) `supabase/migrations/*.sql`, (2) `src/integrations/supabase/types.ts` (Functions block lines 1678–2054, Tables block lines 10–1674), (3) route/component/server-fn code under `src/`. "Used in src" was proven by grepping `.from("table")`, `.rpc("name")`, and server-fn import identifiers; cited as file:line. There are **no edge functions** (`supabase/functions/` does not exist), so cron/webhook-only DB objects are SCAFFOLDED from the app's perspective.

A key architectural nuance recurs below: several backend objects are *exercised indirectly* — `legal_acceptances` and the consent columns are written by the `handle_new_user` / `record_parental_consent` DB triggers/RPCs (driven by signup auth-metadata or the parent-link token), never by a direct `.from()` in `src/`. Those are flagged "indirect" rather than a plain yes/no.

### Tables

| Table | Purpose | Used in src |
|---|---|---|
| `bookings` | Core 1:1 session/booking row (date/slot/duration/price/status/payment cols) | yes — 22 `.from`, e.g. `src/components/calendar/MentorCalendar.tsx`, `src/components/mentor-dashboard/sections/ScheduleSection.tsx:66` |
| `students` | Student profile (incl. DOB, consent cols, code_of_conduct) | yes — `src/components/dashboard/profileEdit.ts:58`, `src/components/student-signup/profileWrite.ts` |
| `mentors` | Mentor profile + verification + status + pricing | yes — `src/routes/mentor-dashboard.tsx:89`, `src/components/mentor-signup/mentorWrite.ts:31` |
| `mentor_availability` | Mentor open slots / weekly availability | yes — `src/components/mentor-dashboard/sections/ScheduleSection.tsx:45`, `src/routes/mentor-dashboard.tsx:107` |
| `mentor_admits` | Mentor's claimed university admits (+ proof_path) for signup | yes — `src/components/mentor-signup/mentorWrite.ts:58` |
| `mentor_private_notes` | Mentor-only private notes about a student | yes — 4 `.from` (mentor dashboard) |
| `mentor_payouts` | Per-mentor weekly accrual row (amount/status/period) | yes — `src/components/mentor-dashboard/sections/EarningsSection.tsx:84` |
| `payment_ledger` | Immutable money audit ledger (capture/refund/clawback) | yes (server-only) — `src/lib/payments/order.functions.ts:134`, `src/lib/payments/refund.functions.ts:91` |
| `session_notes` | Mentor post-session summary + `action_points text[]` | yes — `src/components/mentor-dashboard/sections/PostSessionNotesSection.tsx`, 13 `.from` |
| `action_point_completions` | Student check-off of action points | yes — `src/routes/progress.tsx:92`, `src/components/dashboard/sections/SessionNotesSection.tsx:57` |
| `session_prep_questions` | AI-generated per-booking prep questions (cache) | yes (server) — `src/lib/ai/prep-questions.functions.ts:92` |
| `mentor_match_suggestions` | AI top-3 mentor picks per student/day (cache) | yes (server) — `src/lib/ai/match.functions.ts:67` |
| `ai_rate_limit_events` | AI call rate-limit event log | yes (server) — `src/lib/ai/rate-limit.server.ts:51` |
| `reviews` | Student rating/review of a mentor | yes — `src/components/reviews/ReviewForm.tsx:82`, `src/routes/mentor.$id.tsx:103` |
| `notifications` | In-app notifications | yes — `src/routes/notifications.tsx:114`, `src/components/dashboard/DashboardTopbar.tsx:31` |
| `conversations` | Chat thread between student↔mentor | yes (RPC-only) — read via `get_my_conversations`/`get_conversation`; no direct `.from` |
| `messages` | Chat messages | yes — `src/lib/chat/api.ts:119` |
| `message_reports` | Reported messages for safeguarding review | yes (RPC-only) — written via `submit_report`; `src/components/messages/ReportDialog.tsx` |
| `student_documents` | Student-uploaded docs (shared to mentor) | yes — `src/components/dashboard/sections/MyDocumentsSection.tsx:42` |
| `student_schools` | Student↔school join (current/target schools) | yes — `src/components/student-signup/profileWrite.ts:67` |
| `student_courses` | Student intended-course join | yes — `src/components/student-signup/profileWrite.ts:39` |
| `student_subjects` | Student subject join | yes — `src/components/student-signup/profileWrite.ts:32` |
| `student_sports` | Student sports join | yes — `src/components/student-signup/profileWrite.ts:46` |
| `student_cocurriculars` | Student co-curriculars join | yes — `src/components/student-signup/profileWrite.ts:53` |
| `student_project_categories` | Student project-category join (+detail) | yes — `src/components/student-signup/profileWrite.ts:83` |
| `video_rooms` | Per-booking Daily room (lazy-created) | yes (server) — `src/lib/video/access.functions.ts:102` |
| `video_join_audit` | Immutable video-join audit log | yes (server, write-only) — `src/lib/video/access.functions.ts:141` |
| `disputes` | Booking disputes | partial — read-only in GDPR export `src/lib/me/export.functions.ts:100`; no create/manage UI |
| `mentor_training_completions` | Mentor safeguarding/code-of-conduct training rows | partial — read-only in GDPR export `src/lib/me/export.functions.ts:98`; no training-flow UI |
| `legal_acceptances` | Append-only ToS/privacy/mentor_agreement acceptance | indirect — written by `handle_new_user` trigger from signup metadata (`...20260603000005_p2_mentor_schema.sql:374`); **never read or `.from()`-queried in src** |
| `parental_consent_records` | Append-only immutable parental-consent audit | indirect — written only by `record_parental_consent` RPC; **table itself never `.from()`-read in src** |
| `safeguarding_events` | pii_blocked / student_blocked_mentor events | **no** — written only by DB triggers/RPCs; no src reference (the "safeguarding" strings in src are UI copy) |
| `payout_batches` | Weekly Friday payout-run batch | **no** — written only by `run_weekly_payout_batch` (cron); no src reference |
| `session_action_points` | LEGACY (2026-04-25) action-points table | **no** — superseded by `session_notes.action_points`; no `.from` in src |
| `sessions` | LEGACY (2026-04-25) session table | **no** — superseded by `bookings`; no `.from` in src (route is `dashboard.sessions` but reads `bookings`/`session_notes`) |

`ref_*` (ref_universities, ref_courses, ref_subjects, ref_sports, ref_cocurriculars, ref_project_categories, ref_schools, ref_specialties, ref_academic_domains, ref_add_requests) and `referral_*` (referral_codes, referral_credits) tables are reference/lookup + referral data; reference lookups are reached through `search_reference`/`search_schools`/`create_ref_add_request` RPCs (used in signup) — the `referral_*` tables have no src reference (referral feature is SCAFFOLDED).

### RPCs / Postgres functions

| RPC | Purpose | Called in src |
|---|---|---|
| `finalize_student_profile` | Idempotent student-profile completion stamp | yes — `src/components/student-signup/FinalizeProfile.tsx` (+ gate) |
| `submit_mentor_application` | Lock + stamp mentor application (requires id_document_path) | yes — `src/components/mentor-signup/mentorWrite.ts` |
| `resubmit_mentor_application` | Re-submit after rejection | yes — `src/components/mentor-signup` |
| `record_parental_consent` | Parent-clicks-link consent endpoint (token) | yes — `src/routes` consent page (4 refs) |
| `request_parental_consent` | (Re)send the parental-consent email | yes — `src/components/consent/AwaitingConsentNotice.tsx:36` |
| `requires_consent_base` | Derive minor/consent-required from DOB+grade | yes — `src/lib/consent/...` (2 refs) |
| `book_session` | Create booking w/ RLS/consent/availability/price gates | yes — `src/lib/payments/order.functions.ts` (8 refs) |
| `reschedule_booking` | Reschedule a confirmed booking | yes — `src/components/dashboard/sections/UpcomingSessionsSection.tsx` |
| `cancel_booking_as_student` | Student cancel + refund-tier | yes — `src/components/dashboard/...` (4 refs) |
| `cancel_booking_as_mentor` | Mentor cancel | yes — mentor dashboard (2 refs) |
| `get_my_bookings_as_mentor` | Per-party mentor booking accessor (P10a) | yes — mentor dashboard |
| `get_mentor_earnings` | Ledger-sourced authoritative mentor earnings (P10c) | yes — `src/components/mentor-dashboard/sections/EarningsSection.tsx` |
| `get_mentor_calendar` | Mentor open-slot calendar for booking picker | yes — `src/components/calendar/MentorCalendar.tsx` (4 refs) |
| `get_mentor_public_profile` | Public mentor profile (masked pre-booking) | yes — `src/routes/mentor.$id.tsx` |
| `list_approved_mentor_profiles` | Browse list of approved mentors | yes — `src/routes/browse.tsx` |
| `get_mentor_booking_names` | Resolve mentor names for student's bookings | yes — student dashboard (6 refs) |
| `get_student_booking_names` | Resolve student names for mentor's bookings | yes — mentor dashboard (6 refs) |
| `get_review_student_names` | Resolve student names for reviews | yes — `src/routes/mentor.$id.tsx` |
| `get_student_overview_for_mentor` | Student overview (docs/schools) for mentor | yes — `src/routes/mentor-dashboard.students_.$studentId.tsx` (3 refs) ⚠ historically leaked PII |
| `authorize_video_join` | SECURITY DEFINER video-join gate | yes (server) — `src/lib/video/access.functions.ts` |
| `apply_refund` | Cancel booking + claw back accrual (1 txn) | yes (server) — `src/lib/payments/refund.functions.ts` |
| `confirm_refund_processed` | Terminal refund ledger row | yes — `src/routes/api/public/hooks/razorpay-webhook.ts` |
| `mark_booking_paid` | Capture → confirm booking + ledger | yes — `src/routes/api/public/hooks/razorpay-webhook.ts` |
| `mark_booking_failed` | Mark payment failed | yes — webhook (2 refs) |
| `fail_booking_order` | Free slot on order-create failure | yes — `src/lib/payments/order.functions.ts` (3 refs) |
| `approve_mentor` / `reject_mentor` | Admin approve/reject mentor | yes — `src/routes/admin.tsx` |
| `admin_list_mentors` / `admin_list_students` / `admin_list_bookings` / `admin_list_add_requests` / `admin_stats` | Admin console list/stat RPCs | yes — `src/routes/admin.tsx` |
| `admin_promote_ref_add_request` / `admin_reject_ref_add_request` | Admin moderate ref-data add-requests | yes — `src/routes/admin.tsx` |
| `create_ref_add_request` | Propose a new ref entry | yes — signup (6 refs) |
| `search_reference` / `search_schools` | Typeahead ref lookups | yes — signup ref clients |
| `is_admin` | Admin allowlist gate | yes — 5 refs (route guards + server fns) |
| `validate_college_email` | Classify mentor email → tier | yes — `src/components` mentor signup gate |
| `get_my_conversations` / `get_conversation` | Chat list/detail | yes — chat components |
| `send_message` / `mark_conversation_read` / `block_conversation` / `unblock_conversation` / `soft_delete_message` / `submit_report` | Chat actions | yes — `src/lib/chat/*`, message dialogs |
| `update_booking_status_as_mentor` | Mentor set booking status | **no** — not called in src (mentor flows use cancel/confirm RPCs instead) |
| `admin_set_mentor_status` | Admin set mentor status / verified_at | **no** — not called in src (admin uses `approve_mentor`/`reject_mentor`) |
| `admin_clear_re_review` | Admin clear re_review_pending flag | **no** — not called in src (re-review email type exists, RPC unwired) |
| `reserve_slot` | Hold a slot (P4b holds) | **no** — not called in src |
| `claim_reserved_booking` | Convert a held slot to a booking | **no** — not called in src |
| `release_reserved_booking` | Release a held slot | **no** — not called in src |
| `mentor_training_complete` | Mark mentor training section complete | **no** — not called in src (no training UI) |
| `mark_consent_revoked` | Revoke a student's parental consent | **no** — not called in src |
| `is_approved_mentor` | Predicate: is a mentor approved | **no** — not called from src (used inside other RPCs/RLS only) |
| `chat_contains_pii` | Predicate: does a message contain PII | **no** — not called from src (used inside `send_message` only) |
| `notify_event_email` | Enqueue a transactional email event | **no** — not `.rpc()`-called in src (DB-trigger-internal) |
| `run_weekly_payout_batch` | Cron weekly payout accrual run | **no** — not called in src (cron-only) |

### Server-fns (`src/lib/**/*.functions.ts`)

| Server-fn | File | Purpose | Imported by |
|---|---|---|---|
| `getMentorVerificationDocs` | `admin/mentor-verification.functions.ts:20` | Sign short-lived URLs for a mentor's private verification docs (admin review) | `src/routes/admin.tsx:19` |
| `generateMatchSuggestions` | `ai/match.functions.ts:45` | AI top-3 mentor picks (cached per day) | `src/components/dashboard/sections/TopPicksSection.tsx:7` |
| `expandSessionNote` | `ai/note-expansion.functions.ts:17` | Expand mentor bullet notes → prose draft | `src/components/mentor-dashboard/sections/PostSessionNotesSection.tsx:8` |
| `generatePrepQuestions` | `ai/prep-questions.functions.ts:69` | Generate/fetch AI prep questions for a booking | `src/components/dashboard/sections/UpcomingSessionsSection.tsx:8` |
| `sendBookingEmails` | `email/booking.functions.ts:23` | Send student+mentor booking-confirmation emails | `src/routes/api/public/hooks/razorpay-webhook.ts:4`, `src/lib/payments/order.functions.ts` |
| `deleteMyAccount` | `me/delete.functions.ts:22` | GDPR/DPDP cascading account delete | `src/components/settings/AccountDataSection.tsx:8` |
| `exportMyData` | `me/export.functions.ts:25` | GDPR/DPDP JSON data export | `src/components/settings/AccountDataSection.tsx:7` |
| `createBookingOrder` | `payments/order.functions.ts:62` | book_session + create Razorpay order (server-priced) | `src/components/calendar/MentorCalendar.tsx:9` |
| `getVideoCallAccess` | `video/access.functions.ts:60` | Authorize + mint Daily join token | `src/routes/call.$bookingId.tsx:7` |
| `refundBooking` | `payments/refund.functions.ts:28` | Admin-triggered Razorpay refund + apply_refund | **none** — not imported anywhere in src (no admin refund UI) |

### Notable columns (safeguarding / legal / payments / AI)

| Column | Defined in | Purpose | Read/written in src |
|---|---|---|---|
| `students.date_of_birth` (date) | `...20260603000005` (+ p1 metadata) | Age for minor/consent derivation | yes — `src/components/dashboard/profileEdit.ts:58`, `ProfileSection.tsx:287` (read); `MentorSignupWizard.tsx:174` writes mentor DOB |
| `students.parental_consent_at` (timestamptz) | `...20260523000008_g4` | Fast-path consent flag the booking gate reads | yes (read) — `src/lib/consent/useConsentStatus.ts:35` |
| `students.parental_consent_email` (text) | `...20260523000008_g4` | Parent email for consent link | yes (read) — `src/lib/consent/useConsentStatus.ts:35` |
| `students.parent_phone` (text) | `...20260530000001` | Parent phone | no direct src read (set via signup trigger metadata) |
| `students.parental_consent_token` (uuid UNIQUE) | `...20260523000008_g4` | Consent-link token (unreadable by client, explicitly excluded) | no — explicitly deleted in export `src/lib/me/export.functions.ts:41` |
| `students.code_of_conduct_accepted_at` (timestamptz) | `...20260523000007_g_schema_bulk:226` | Student code-of-conduct acceptance | **no** — column-locked (`consent_column_lock`), never read/written in src |
| **`is_minor`** | n/a | NOT a column — minor status is DERIVED via `requires_consent_base(dob,grade)` | n/a (no stored flag exists) |
| `mentors.code_of_conduct_accepted_at` (timestamptz) | `...20260523000007_g_schema_bulk:229` | Mentor code-of-conduct acceptance | **no** — never read/written in src |
| `mentors.id_document_path` (text) | `...20260523000006_f1` | Mentor ID upload storage path | yes — `src/components/mentor-signup/mentorWrite.ts:32` (write), admin verification fn (read) |
| `mentors.enrollment_letter_path` (text) | `...20260523000006_f1` | Enrollment-letter storage path | yes — `src/components/mentor-signup/mentorWrite.ts:42` |
| `mentors.verified_at` (timestamptz) | `...20260523000006_f1` | Admin verification timestamp (locked) | yes (read) — `src/routes/browse.tsx:141`, `src/routes/mentor.$id.tsx:257` |
| `mentors.verified_by` (uuid) | `...20260523000006_f1` | Admin who verified (locked) | no — not read in src |
| `mentors.verification_notes` (text) | `...20260523000006_f1` | Admin notes / rejection reason (locked) | yes (read) — `src/routes/mentor-dashboard.tsx:89` |
| `mentors.status` (text) | mentors base | Application status (pending/approved/rejected/...) | yes (read) — `src/routes/mentor-dashboard.tsx:89` |
| `mentors.application_submitted_at` (timestamptz) | `...20260605000001_p8:50` | When mentor application submitted | yes (read) — `src/routes/mentor-dashboard.tsx:89` |
| `mentors.re_review_pending` (boolean) | `...20260603000005:66` | Re-review-after-edit flag | no — not read in src (cleared only by unwired `admin_clear_re_review`) |
| `legal_acceptances.doc_type` (CHECK 'terms','privacy','mentor_agreement') | `...20260603000004:246` | Which legal doc accepted | indirect — written by signup trigger from `terms_version`/`privacy_version`/`mentor_agreement_version` metadata (`SignupWizard.tsx:223`, `MentorSignupWizard.tsx:176`); never read in src |
| `parental_consent_records.{parent_email,consent_scope,consent_version,consented_at}` | `...20260530000001:59` | Immutable consent audit | written only by `record_parental_consent`; never `.from()`-read in src |
| `payment_ledger.{event_type,mentor_share_inr,platform_fee_inr,amount_inr,idempotency_key}` | `...20260531120002` | Immutable money ledger | yes (server) — inserted in `order.functions.ts:134` / `refund.functions.ts:91`; read by `get_mentor_earnings` |
| `mentor_payouts.{amount_inr,status,payout_date,period_end,batch_id,payout_id-link}` | `...20260425101339` + `...20260531120003` | Weekly payout accrual | yes — `EarningsSection.tsx:85` selects `id, amount_inr, status, payout_date, period_end` |
| `payout_batches.{cutoff_at,run_at,status}` | `...20260531120003` | Weekly batch header | **no** — never referenced in src |
| `safeguarding_events.{event_type,actor_id,conversation_id,detail}` | `...20260530000004` | Safeguarding incident log (pii_blocked / blocked) | **no** — never referenced in src |
| `mentor_training_completions.{section_key 'safeguarding'/'code_of_conduct',completed_at}` | `...20260523000007` | Mentor training completion | partial — read-only in GDPR export; no training-completion write UI |
| `bookings.{paid_at,razorpay_order_id,razorpay_payment_id,status,payout_id}` | `...20260531120001` (+ payouts) | Payment/payout state on booking | yes — webhook + earnings/schedule selects |

**Net counts:** WIRED ≈ 62 (tables+RPCs+server-fns directly or indirectly exercised by a route/component/server-fn). SCAFFOLDED ≈ 19 (backend exists, no src usage) — see `candidateBackendWithoutFrontend`. "Indirect"-only objects (`legal_acceptances`, `parental_consent_records`) are counted as WIRED because a write path exists through a trigger/RPC the app invokes, but they are flagged as never *directly read* in src, which is itself a redesign signal.

---

## Synthesis & reconciliation notes

Notes from the adversarial cross-check pass (false positives dropped, cross-surface wiring corrected):

Cross-surface corrections (items a single surface agent flagged "scaffolded for this surface" but are WIRED in another surface — all DROPPED from A): (1) `get_mentor_booking_names` — mentor-dashboard agent flagged it scaffolded, but it has 6 callers in the STUDENT dashboard (MyPlugsSection.tsx:28, PastSessionsSection.tsx:62, UpcomingSessionsSection.tsx:88, SessionNotesSection.tsx:51, session-notes.tsx:86, progress.tsx:86). (2) `generatePrepQuestions` — mentor agent flagged scaffolded; wired in student UpcomingSessionsSection.tsx:8,458. (3) `reschedule_booking` — mentor agent flagged scaffolded (no mentor reschedule UI); wired student-side at UpcomingSessionsSection.tsx:320. (4) `get_student_overview_for_mentor` — student agent noted "no student self-overview"; it IS wired on the mentor side (MentorUpcomingSessions.tsx:101, students_.$studentId.tsx:77), so not a backend-without-frontend item.

Addition the backend-reference agent missed: the document-sharing domain. The backend agent's list cited referral/disputes/training as scaffolded domains but did not enumerate document sharing; the student-dashboard agent caught `share_student_document`/`add_document_*`/`document_versions`/`document_notes`. On verification, the underlying SHARE record table is `document_shares` (20260604000010:48), distinct from `document_versions`/`document_notes` — added all three tables + four RPCs to A under "Document sharing".

Verified-but-distinct write-vs-read nuance: `legal_acceptances` and `parental_consent_records` have an indirect WRITE path (trigger/RPC the app invokes), so the backend agent counted them WIRED. For this A/B exercise the relevant fact is they are never READ/surfaced anywhere, which is the redesign signal — kept in A as "no surface shows acceptance/consent state."

`students.parent_phone`: verified it IS written at signup (SignupWizard.tsx:220) but never read back and explicitly excluded from the edit allowlist (profileEdit.ts:79) — kept in A as a no-read-back/no-edit gap rather than a missing capture.

B was trimmed hard: the student-dashboard agent's own list already self-flagged three of its five candidates as "REAL, listed only to confirm not placeholders" — those (stat tiles, TopPicks reason) plus the EarningsSection items and the OAuth comment were dropped. The MyPlugs verified badge is the one clear genuine fakery; the "View notes" anchor and the dropped TopPicks price are wiring/coverage gaps rather than fabricated data but are kept because the surfaced control misrepresents reachable backing.
