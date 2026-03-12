"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-sm font-semibold">Something went wrong</h2>
        <p className="max-w-md text-xs text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
