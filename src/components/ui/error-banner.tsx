import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ErrorBannerProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Section-scoped error banner. Render when a React Query call returns
 * `isError`. Pass `onRetry={() => query.refetch()}` for a manual retry
 * button.
 */
export function ErrorBanner({ message, onRetry, className }: ErrorBannerProps) {
  return (
    <Alert variant="destructive" className={cn("text-left", className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <p>{message ?? "Something went wrong loading this section."}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Try again
          </button>
        )}
      </AlertDescription>
    </Alert>
  );
}
