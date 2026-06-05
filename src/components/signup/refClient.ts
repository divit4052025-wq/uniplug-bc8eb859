// P7 — thin wrappers over the Phase-0 reference-data RPCs (verified signatures):
//   search_reference(_kind, _q, _limit?) → {id,name}[]   (anon-callable)
//   search_schools(_q, _limit?)          → {id,name}[]   (anon-callable, lenient)
//   create_ref_add_request(_kind, _name) → uuid          (authenticated only)
import { supabase } from "@/integrations/supabase/client";
import type { RefItem, RefKind } from "./types";

/** Strict typeahead over a ref_* table. Returns [] on empty query or error
 *  (typeahead must never throw into the UI). */
export async function searchReference(kind: RefKind, q: string, limit = 12): Promise<RefItem[]> {
  const query = q.trim();
  if (!query) return [];
  const { data, error } = await supabase.rpc("search_reference", {
    _kind: kind,
    _q: query,
    _limit: limit,
  });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, name: r.name }));
}

/** Lenient school suggestions. Suggestion-only — the caller keeps whatever they
 *  typed; this only offers matches. */
export async function searchSchools(q: string, limit = 12): Promise<RefItem[]> {
  const query = q.trim();
  if (!query) return [];
  const { data, error } = await supabase.rpc("search_schools", { _q: query, _limit: limit });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, name: r.name }));
}

/** File a "can't find it → request to add" entry. Authenticated only, so this is
 *  called from the finalize step (never the pre-auth wizard, which stashes the
 *  pending name and defers the request). Best-effort: a failed request must not
 *  block profile completion. */
export async function createRefAddRequest(kind: RefKind, name: string): Promise<boolean> {
  const proposed = name.trim();
  if (!proposed) return false;
  const { error } = await supabase.rpc("create_ref_add_request", {
    _kind: kind,
    _proposed_name: proposed,
  });
  return !error;
}
