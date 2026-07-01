// Waitlist input validation + normalization — isomorphic (pure, no I/O), so the
// client form and the server endpoint share EXACTLY one definition of "valid".
// The server is always authoritative; the client mirror is only for UX.
//
// Minimal-data rule: the waitlist collects name + email + kind and nothing else.

export type WaitlistKind = "school" | "college";

export const NAME_MAX = 80;
export const EMAIL_MAX = 254; // RFC 5321 practical maximum.

// Same shape the design prototype used, kept deliberately loose: one @, a dot in
// the domain, no spaces. Real deliverability is proven at launch, not here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercase + trim so "Div@X.com" and "div@x.com " are one row (never inflate). */
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Trim, collapse internal whitespace, hard-cap length. */
export function normalizeName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, NAME_MAX) : "";
}

export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= EMAIL_MAX && EMAIL_RE.test(email);
}

export function isValidName(name: string): boolean {
  return name.length > 0 && name.length <= NAME_MAX;
}

export function isValidKind(kind: unknown): kind is WaitlistKind {
  return kind === "school" || kind === "college";
}

export interface ParsedWaitlistInput {
  name: string;
  email: string;
  kind: WaitlistKind;
}

export type ValidationField = "name" | "email" | "kind";

export class WaitlistValidationError extends Error {
  field: ValidationField;
  constructor(field: ValidationField, message: string) {
    super(message);
    this.name = "WaitlistValidationError";
    this.field = field;
  }
}

/**
 * Normalize + validate a raw submission. Throws WaitlistValidationError on the
 * first bad field. Returns the clean values ready to store.
 */
export function parseWaitlistInput(raw: {
  name?: unknown;
  email?: unknown;
  kind?: unknown;
}): ParsedWaitlistInput {
  const name = normalizeName(raw.name);
  if (!isValidName(name)) throw new WaitlistValidationError("name", "Enter your name.");

  const email = normalizeEmail(raw.email);
  if (!isValidEmail(email)) throw new WaitlistValidationError("email", "Enter a valid email.");

  if (!isValidKind(raw.kind)) throw new WaitlistValidationError("kind", "Invalid signup type.");

  return { name, email, kind: raw.kind };
}
