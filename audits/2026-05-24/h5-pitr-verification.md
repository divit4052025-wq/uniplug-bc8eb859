# Phase H5: Supabase PITR verification — 2026-05-24

## Question

Per amendment H1, confirm Point-in-Time Recovery is enabled on the live Supabase tier (project `ncfhmbugjeuerchleegq`). If not enabled, flag as a **pre-launch blocker** — Uniplug cannot ship V1 with student PII + no PITR.

## Method

Queried `pg_settings` on the live project for the WAL configuration values that gate PITR:

```sql
SELECT name, setting, source FROM pg_settings
 WHERE name IN ('wal_level','archive_mode','max_wal_senders','wal_keep_size')
 ORDER BY name;
```

## Result

| Setting | Value | Source |
|---|---|---|
| `archive_mode` | `on` | configuration file |
| `wal_level` | `logical` | configuration file |
| `max_wal_senders` | `5` | configuration file |
| `wal_keep_size` | `0` | default |

## Conclusion

**INCONCLUSIVE — prerequisites pass; dashboard confirmation required before launch.**

The `pg_settings` values above prove the *prerequisites* for PITR are in place (archiving on, logical WAL, replication slots available), but on Supabase these are **tier-independent defaults** — a Free-tier project (no PITR retention available) shows the same `pg_settings` shape. The actual PITR retention window is a dashboard/billing toggle that is not observable from `pg_settings`. So this SQL evidence alone cannot distinguish a PITR-enabled project from a PITR-not-enabled one.

To close H5 the operator must visually confirm the Supabase Dashboard → Database → Backups page shows "Point-in-Time Recovery: Enabled" with the expected retention window (typically 7 days on Pro tier, longer on Team). Paste a screenshot or note the retention window into this file before launch.

**Until that confirmation lands, H5 stays open and v1-readiness-final.md's launch-blocker count reflects it as the one open blocker.**

## Operator follow-up

1. Open Supabase Dashboard → Database → Backups and visually confirm PITR shows enabled with the expected retention window (typically 7 days on Pro tier, longer on Team).
2. Test a restore-to-branch once before launch: pick a point ~5 minutes ago, restore to a Supabase branch, confirm a known-recent write appears. Document the runbook for on-call.
3. If the tier downgrades to one without PITR, this audit must be re-run before any data-bearing change ships.
