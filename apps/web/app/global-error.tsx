"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

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
    <html>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "1.5rem" }}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ fontSize: "0.75rem", color: "#666", maxWidth: "28rem", textAlign: "center" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1rem", fontSize: "0.75rem", border: "1px solid #ccc", borderRadius: "0.375rem", cursor: "pointer", background: "transparent" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
