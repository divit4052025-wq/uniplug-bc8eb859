// Shared signup scaffolding — reference-data selection types used by the
// ref-data typeahead (RefMultiSelect / refClient). Role-agnostic (student +
// mentor wizards both use these).

/** A reference-data selection. id === null means "couldn't find it → request to
 *  add": it can't be linked to a join table yet (no canonical ref row), so at
 *  finalize a create_ref_add_request is filed for it instead. */
export interface RefItem {
  id: string | null;
  name: string;
}

/** Strict ref kinds accepted by search_reference / create_ref_add_request. */
export type RefKind =
  | "university"
  | "course"
  | "subject"
  | "sport"
  | "cocurricular"
  | "project_category";
