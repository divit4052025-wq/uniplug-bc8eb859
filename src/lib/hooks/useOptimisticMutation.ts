// Shared optimistic-mutation hook.
//
// Wraps React Query's useMutation with the cancel → snapshot → optimistic
// patch → rollback-on-error → invalidate-on-settled pattern that's currently
// inlined in 8+ components (SessionNotesSection, notifications.tsx,
// PostSessionNotesSection, MySchoolsSection, …).
//
// Design notes:
// - The hook takes one or more `queryKey`s. All of them are cancelled +
//   snapshotted + optimistically patched + invalidated together. Most call
//   sites only need a single key.
// - `optimisticUpdate` runs once per key, receiving that key's current cache
//   value and the mutation variables. Returning the same reference is fine —
//   React Query treats that as a no-op for the cache entry but still tracks
//   the snapshot in the context for rollback.
// - On error, every snapshotted key is restored from its snapshot. Then a
//   toast is fired (default message can be overridden, or computed from the
//   error). On success, an optional success toast fires.
// - Standard React Query options pass through via `mutationOptions` so a
//   caller can still wire up onSuccess side effects (e.g. closing a modal).
//   Any onMutate / onError / onSettled the caller passes in `mutationOptions`
//   is called AFTER our own handlers, with the context our onMutate built.

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";

export interface OptimisticMutationContext {
  /** Snapshots taken before the optimistic patch, one entry per query key. */
  snapshots: Array<{ key: QueryKey; previous: unknown }>;
}

export interface UseOptimisticMutationOptions<TData, TVariables, TResult> {
  /** The async mutation function. */
  mutationFn: (variables: TVariables) => Promise<TResult>;

  /**
   * Query keys whose caches participate in the optimistic update. All are
   * cancelled before the patch, snapshotted, optimistically updated, rolled
   * back on error, and invalidated on settle.
   */
  queryKeys: QueryKey[];

  /**
   * Patch applied to each query's current cache value. Receives the cached
   * data (or undefined if the cache is empty) and the mutation variables;
   * returns the new cache value. Called once per `queryKeys` entry.
   */
  optimisticUpdate: (oldData: TData | undefined, variables: TVariables) => TData | undefined;

  /** If set, a success toast is fired with this message after the mutation resolves. */
  successMessage?: string;

  /**
   * Error message strategy. Either a fixed string or a function that derives
   * a message from the thrown error. Defaults to "Something went wrong."
   */
  errorMessage?: string | ((error: unknown, variables: TVariables) => string);

  /** Standard React Query mutation options pass-through. */
  mutationOptions?: Omit<
    UseMutationOptions<TResult, unknown, TVariables, OptimisticMutationContext>,
    "mutationFn" | "onMutate" | "onError" | "onSettled" | "onSuccess"
  > & {
    onSuccess?: (
      data: TResult,
      variables: TVariables,
      context: OptimisticMutationContext | undefined,
    ) => void | Promise<void>;
  };
}

function resolveErrorMessage<TVariables>(
  errorMessage: string | ((error: unknown, variables: TVariables) => string) | undefined,
  error: unknown,
  variables: TVariables,
): string {
  if (typeof errorMessage === "function") return errorMessage(error, variables);
  if (typeof errorMessage === "string") return errorMessage;
  return "Something went wrong.";
}

/**
 * useOptimisticMutation — React Query useMutation with the optimistic-update
 * lifecycle baked in. See module header for the full pattern.
 */
export function useOptimisticMutation<TData, TVariables, TResult = void>(
  opts: UseOptimisticMutationOptions<TData, TVariables, TResult>,
): UseMutationResult<TResult, unknown, TVariables, OptimisticMutationContext> {
  const qc = useQueryClient();
  const { mutationFn, queryKeys, optimisticUpdate, successMessage, errorMessage, mutationOptions } =
    opts;

  return useMutation<TResult, unknown, TVariables, OptimisticMutationContext>({
    ...mutationOptions,
    mutationFn,
    onMutate: async (variables) => {
      // Cancel in-flight queries so they can't overwrite our optimistic state.
      await Promise.all(queryKeys.map((key) => qc.cancelQueries({ queryKey: key })));

      // Snapshot every key for rollback.
      const snapshots = queryKeys.map((key) => ({
        key,
        previous: qc.getQueryData(key),
      }));

      // Apply the optimistic patch to each key.
      for (const { key } of snapshots) {
        qc.setQueryData<TData>(key, (current) =>
          optimisticUpdate(current as TData | undefined, variables),
        );
      }

      return { snapshots };
    },
    onError: (error, variables, context) => {
      // Roll every snapshot back.
      if (context?.snapshots) {
        for (const { key, previous } of context.snapshots) {
          qc.setQueryData(key, previous);
        }
      }
      toast.error(resolveErrorMessage(errorMessage, error, variables));
    },
    onSuccess: (data, variables, context) => {
      if (successMessage) toast.success(successMessage);
      mutationOptions?.onSuccess?.(data, variables, context);
    },
    onSettled: () => {
      // Re-fetch every participating query so the cache settles on truth.
      for (const key of queryKeys) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
