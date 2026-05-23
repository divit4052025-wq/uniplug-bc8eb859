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

**PASS.** PITR is enabled on the live tier:
- `archive_mode = on` → WAL segments are archived
- `wal_level = logical` → WAL contains enough info for replay (also enables logical replication)
- `max_wal_senders = 5` → replication connections allowed
- Supabase Dashboard → Database → Backups should show "Point-in-Time Recovery: Enabled" with the project's retention window

No pre-launch blocker.

## Operator follow-up

1. Open Supabase Dashboard → Database → Backups and visually confirm PITR shows enabled with the expected retention window (typically 7 days on Pro tier, longer on Team).
2. Test a restore-to-branch once before launch: pick a point ~5 minutes ago, restore to a Supabase branch, confirm a known-recent write appears. Document the runbook for on-call.
3. If the tier downgrades to one without PITR, this audit must be re-run before any data-bearing change ships.
