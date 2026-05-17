---
name: investigate
description: Read-only investigation into an open question — root cause analysis, stocktake, deep-dive. Outputs a structured markdown report. Never modifies code or DB state.
argument-hint: "<the question to investigate>"
---

Invoke the **investigation-agent** subagent
(`agents/investigation-agent.md`).

Use `$ARGUMENTS` as the question. If $ARGUMENTS is empty, ask the user
to state the question.

The subagent is **read-only**. It does not edit files, run migrations,
modify DB state, or take any action besides reading and querying. Output
is a markdown report at:

- `scratch/<short-slug>-$(date -u +%Y-%m-%d).md` for casual
  investigations, OR
- `audits/$(date -u +%Y-%m-%d)/<topic>.md` for formal, audit-grade
  reports.

The report includes:

1. The question (restated).
2. Scope — what's in and out.
3. Evidence: file reads/greps with file:line, git history with commit
   hashes, DB state via read-only SELECT, external state via `gh`.
4. Synthesis — what the evidence adds up to.
5. Conclusion — direct answer, including "I don't know" when honest.
6. Recommendations (optional) — what to do next, but no action taken.
7. Open questions.

Examples of good `/investigate` topics:

- "Why does the calendar show off-by-one hours for users in IST?"
- "Are we leaking any PII through Anthropic API calls?"
- "What's the history of the mentors.approval_status field?"
- "Which of our policies have no rejection test?"
