-- 20260530000005_chat_grants_lockdown.sql
--
-- Follow-up to 20260530000004_chat_messaging.sql.
--
-- conversations and messages claim to be immutable-except-via-DEFINER-RPC:
-- the prior migration REVOKEd INSERT/UPDATE/DELETE from anon/authenticated and
-- granted only SELECT (RLS-gated). But the Supabase default ACL also hands
-- anon/authenticated the TRUNCATE, REFERENCES, and TRIGGER privileges on every
-- public table, and those were never revoked. None are reachable through the
-- PostgREST client surface (there is no REST verb for them, and end users hold
-- only a JWT, not a SQL connection), so they are not an app-exploitable vector
-- today — but message_reports and safeguarding_events are locked to a full
-- REVOKE ALL, and these two safety-bearing tables should read the same way.
-- This brings the grants into parity with the immutability the schema claims:
-- after this migration anon/authenticated retain SELECT only.
--
-- Pure privilege change. No DDL, no data, no type-affecting change.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.conversations, public.messages
  FROM anon, authenticated;
