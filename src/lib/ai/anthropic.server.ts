/**
 * Thin Anthropic Messages API client for Uniplug's three V1 AI features.
 *
 * Phase D0 (2026-05-23). Per the ai-feature-builder skill: server-side
 * only, never imported into anything that lands in the browser bundle.
 * The `.server.ts` suffix is the convention this codebase uses
 * (matches client.server.ts) so Vite tree-shakes it out of the client.
 *
 * Why raw fetch instead of @anthropic-ai/sdk? V1 features are all
 * one-shot completions, no streaming / tool-use / batch needed. Workers
 * is Fetch-API-native; no SDK saves a dependency.
 *
 * ANTHROPIC_API_KEY is a Cloudflare Worker secret (`wrangler secret put
 * ANTHROPIC_API_KEY`). See ENV.md.
 */

const DEFAULT_MODEL = "claude-sonnet-4-6";

export type CallClaudeOpts = {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
};

export type ClaudeResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export async function callClaude(opts: CallClaudeOpts): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in Worker env");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = json.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");

  return {
    text,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}
