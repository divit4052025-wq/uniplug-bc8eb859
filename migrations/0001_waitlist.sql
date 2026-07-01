-- Waitlist store — launch mode (Cloudflare D1, NOT Supabase).
-- Collects the absolute minimum: name + email + which side they're on.
-- No DOB, phone, parent info, account, or link to the consent/auth machinery.
--
-- email is UNIQUE and always stored lowercased+trimmed by the submit endpoint,
-- so the same person joining twice UPDATEs their one row and never inflates the
-- count. `kind` is constrained to the two real sides. `id` is a stable ascending
-- ordinal used to compute an honest, unchanging waitlist position per side.

CREATE TABLE IF NOT EXISTS waitlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('school', 'college')),
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

-- counts() groups by kind; the position query filters by kind + id.
CREATE INDEX IF NOT EXISTS idx_waitlist_kind ON waitlist (kind);
