import { QueryClient } from "@tanstack/react-query";
import { isTransient } from "./retry";

/**
 * Factory for the app's QueryClient. Called from `__root.tsx` via useState
 * so each component instance gets its own cache — required for SSR safety
 * on Cloudflare Workers, where a module-level singleton would leak data
 * between concurrent requests.
 *
 * Defaults:
 * - Queries: up to 3 retries, 200ms × 2^i backoff (max 30s), bail on 4xx / RLS.
 * - Mutations: no retry (POSTs are generally not idempotent).
 * - staleTime 30s — avoids refetch loops between component re-mounts.
 * - refetchOnWindowFocus disabled — too noisy for a dashboard product.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (!isTransient(error)) return false;
          return failureCount < 3;
        },
        retryDelay: (i) => Math.min(200 * 2 ** i, 30_000),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
