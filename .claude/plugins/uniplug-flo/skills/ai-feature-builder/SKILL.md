---
name: ai-feature-builder
description: Server-side Anthropic API integration for Uniplug's three V1 AI features (session prep questions, post-session note expansion, mentor matching). Never exposes ANTHROPIC_API_KEY to the client. Runs from Cloudflare Workers.
model_class:
  prompt_design: opus
  wiring: sonnet
triggers:
  - "Adding or modifying any AI-powered feature"
  - "User says: AI feature, Anthropic, Claude API, prompt design, AI matching, AI prep, AI notes"
  - "Any code that touches api.anthropic.com or @anthropic-ai/sdk"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Skill: ai-feature-builder

Uniplug ships three AI features in V1:

1. **Session prep questions.** Student books a session → AI generates 3–5 questions tailored to the student's profile and the mentor's expertise → student reviews before the call.
2. **Post-session note expansion.** Mentor writes bullets after a session → AI expands them into prose for the student-facing note, preserving the mentor's voice.
3. **Mentor matching.** Student fills onboarding → AI suggests the top 3 mentors with one-sentence reasoning each.

All three run server-side from Cloudflare Workers. None of them call Anthropic from the browser.

## The non-negotiable rule

**`ANTHROPIC_API_KEY` is a Worker secret.** It never enters `src/`, never appears in any `import.meta.env.VITE_*` variable, never goes into the client bundle. It is set via `wrangler secret put ANTHROPIC_API_KEY` and read inside the Worker handler as `env.ANTHROPIC_API_KEY`.

If a code change moves any Claude API call to the browser, the change is rejected. No exceptions — exposing the key burns through the budget in minutes and gives unauthenticated callers free reign over our quota.

## Choosing between fetch and the SDK

Two valid options:

**Option A — raw `fetch` in the Worker.** Smallest dependency footprint. Works perfectly in Workers (which are Fetch-API native). Use when the request is straightforward and you don't need streaming helpers.

```typescript
const resp = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  }),
});
const data = await resp.json();
```

**Option B — `@anthropic-ai/sdk`.** Higher-level. Supports Cloudflare Workers and disables browser use by default — that default is your friend, do not override it. Use when you want streaming, tool use, or prompt caching helpers.

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const message = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }],
});
```

Pick the one that fits. Default to `fetch` for the three V1 features — they're all one-shot completions, no streaming required for the UX (though session-prep questions could stream in the future).

## Prompt template patterns

Every AI feature has a **system prompt** (stable, versioned) and a **user prompt** (templated from context).

### Pattern: session-prep questions

```
SYSTEM:
You generate session-prep questions for a peer-mentorship session on
the Uniplug platform. The mentee is a school student in India applying
to global universities. The mentor is a current undergraduate at a
top university.

Generate 3–5 questions. Each question should:
- Be specific to the mentor's expertise and the mentee's stated goals
- Be answerable in ~2 minutes of conversation
- Avoid yes/no questions
- Avoid asking the mentor to share personal contact info or anything
  off-platform

Output strictly as a JSON array of strings. No prose, no preamble.

USER:
Mentor expertise: {mentor.bio_short}
Mentee goal: {student.onboarding_goal}
Mentee target universities: {student.target_unis}
Session topic: {booking.topic}
```

### Pattern: post-session note expansion

```
SYSTEM:
You expand bullet-point session notes into a 2–3 paragraph student-facing
note. Preserve the mentor's voice — keep their phrasing, technical depth,
and any specific resources they mentioned. Do not add new facts, do not
hallucinate resource links, do not add motivational filler.

USER:
Mentor's bullets:
{mentor_bullets}

Session context: {session_topic}, {session_duration_mins} min session
```

### Pattern: mentor matching

```
SYSTEM:
You rank candidate mentors for a student based on the student's
onboarding profile. Output exactly 3 mentor IDs in priority order, with
a one-sentence reason for each. Output strictly as JSON:
{ "ranked": [{ "mentor_id": "...", "reason": "..." }, ...] }

Do not invent mentor IDs. Only output IDs that appear in the candidate
list.

USER:
Student profile: {student.onboarding_blob}
Candidate mentors (id + bio):
{candidates}
```

### Prompt template rules

- **System prompts are versioned files** under `prompts/<feature>/v<n>.txt`. Bumping a version is a deliberate act, not an inline edit.
- **User prompts are template strings**, not free text. The Worker assembles them from typed inputs. No user-controlled string is ever inserted *as* the prompt — only into known template slots.
- **No PII in prompts beyond what's necessary.** The mentor matching prompt needs the student's goals; it does *not* need their email, phone, or document contents. Audit each prompt's input list before shipping.
- **Output format is enforced.** When you need structured output (JSON), say so in the system prompt *and* parse defensively (try/catch around `JSON.parse`). Default to `response_format` when the SDK supports it. If parse fails, retry once with a corrective system message before falling back to a safe default.

## Under-18 considerations

Many Uniplug users are minors. The matching and prep prompts must:

- Not surface mentor PII beyond what's already public (bio, expertise).
- Not encourage off-platform contact ("DM the mentor on Instagram" is forbidden output — the system prompt explicitly bans it).
- Run on a stricter system prompt template flagged in `prompts/<feature>/under-18.txt` when the student account is flagged as minor.

## Cost + rate limiting

- Cache safe-to-cache outputs. Session-prep questions for the same student × mentor × topic can cache for ~24h. Cache key in Workers KV.
- Prompt caching via `cache_control` blocks (Anthropic SDK supports it) for the system prompts — they're long-lived and stable.
- Rate-limit per user. Anthropic's account-level rate limit is the global ceiling; per-user we cap at, say, 20 generations per day per feature. Cap enforced in the Worker via Workers KV.

## Anti-patterns

- **Calling the Claude API from the browser.** Burns the key, period.
- **Passing user-controlled strings as the system prompt.** Always template into a fixed slot.
- **Returning the raw API response to the client.** Strip metadata (model version, token counts) before responding — those leak operational detail.
- **No fallback for parse failure.** A flaky JSON parse should fall back to "we couldn't generate suggestions, here are the mentor's top tags" — never a 500 to the user.
- **Logging full prompt + response.** Logs are PII-adjacent. Log the request ID and token counts; not the bodies. See `observability` skill.

## See also

- `observability` — instrumentation for AI features (latency, token cost, error rate).
- `security-audit` — surface 3 (secrets) and surface 4 (PII flows) cover AI integrations.
- Anthropic SDK docs: https://docs.anthropic.com/en/api/client-sdks
