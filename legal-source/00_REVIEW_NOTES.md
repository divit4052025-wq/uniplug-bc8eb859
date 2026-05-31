# UniPlug Legal Documents — Review Notes & Punch-List

**Prepared:** 30 May 2026 · For Divit Fatehpuria

> These are first-draft documents prepared to be thorough and India/DPDP-aware. They are **not a substitute for a qualified Indian lawyer**, especially because UniPlug processes **minors' personal data** — the highest-liability area in Indian data law. Use this as the punch-list to make a lawyer's review fast and cheap.

---

## A. Placeholders to fill before going live

1. **Company name** — `UniPlug Technologies Private Limited` is used throughout as a placeholder. Swap for the exact registered name once incorporated. (If you go live *before* incorporating, a lawyer should advise on who contracts/holds liability in the interim.)
2. **`[registered address]`** — appears in every document. Insert the real registered/correspondence address.
3. **Email addresses assumed:** `support@uniplug.app`, `privacy@uniplug.app`, `grievance@uniplug.app`, `safeguarding@uniplug.app`. Make sure each inbox exists and is monitored. (`grievance@` and `privacy@` are legally required to be live and responsive.)
4. **Grievance Officer** — set as **Divit Fatehpuria**. Confirm, and ensure the role is genuinely staffed.

## B. Decisions deferred to "pricing" (currently sensible defaults — revisit)

5. **Refund windows** — set to: ≥24h = full refund; <24h = none; mentor no-show = full refund/reschedule; subscriptions cancel-anytime, no pro-rata. Confirm at pricing.
6. **Refund processing time** — stated as 5–7 business days. Confirm.
7. **Mentor commission** — left as "per published fee schedule, may vary by mentor category." No number is committed. You must publish an actual fee schedule before mentors transact.
8. **Mentor payout schedule / minimum threshold** — left general. Define before payouts go live.
9. **Liability cap** (Terms §15.3) — set to fees paid in the prior 3 months. A lawyer may adjust.
10. **Data retention** (Privacy §7) — target 90 days post-closure, with legal-retention carve-outs. Confirm exact periods (payment/tax records have statutory minimums).

## C. Items that need a real lawyer's sign-off (not just fill-in)

11. **DPDP "verifiable parental consent"** — the email-link mechanism is an interim approach. Confirm with counsel that it meets the "verifiable consent" standard, especially once the DPDP Rules on consent for children are fully in force. This is the single biggest legal risk.
12. **The known consent gap** — a child with access to the parent's email inbox could self-consent. Counsel should advise whether additional verification is needed.
13. **Cross-border transfer** — most data (incl. the database in Tokyo, and US-based email/AI) leaves India. Confirm the consent-based transfer position is adequate, and watch for any future government restriction on transfer destinations.
14. **Intermediary / safe-harbour status** (Terms §17) — confirm UniPlug's IT Act intermediary positioning and that grievance timelines/processes match the IT Rules.
15. **Consumer Protection (E-Commerce) Rules** — a marketplace connecting buyers and sellers may have additional disclosure duties; have counsel check applicability.
16. **Mentor tax/withholding** — independent-contractor payouts may trigger TDS/GST considerations. Get accounting/legal advice before payouts scale.
17. **Mandatory-reporting (POCSO)** — confirm UniPlug's obligations if a safeguarding report involves a sexual-offence concern about a minor; the safeguarding flow may need a defined escalation path.

## D. Assumptions baked into the drafts (correct me if any are wrong)

- Minimum age **13**; everyone under 18 needs parental consent.
- Mentors are India-based independent contractors for V1.
- Video calls are **never recorded or transcribed** (this is stated as a safety feature across multiple docs — keep it true in the product).
- No third-party analytics/advertising; essential storage only.
- AI features send user input to Anthropic; content is **not used to train models**; students keep essay ownership.
- Payments via Razorpay (India); database via Supabase (Tokyo); video via Daily.co; email via Resend; AI via Anthropic.

## E. Documents in this set

1. `01_Terms_of_Service.md`
2. `02_Privacy_Policy.md`
3. `03_Parental_Consent.md` (this is the text the consent-link page should show — replaces the `TODO-LEGAL` stubs; **bump `consent_version` when finalised**)
4. `04_Mentor_Agreement.md`
5. `05_Refund_Cancellation_Policy.md`
6. `06_Community_Guidelines_Safeguarding.md`
7. `07_Cookie_Policy.md`

> When counsel finalises the parental-consent wording (item 11), remember to **bump `consent_version`** in the app so prior consents are revalidated against the new text.
