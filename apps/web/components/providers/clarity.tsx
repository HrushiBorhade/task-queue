"use client";

import { useEffect } from "react";

export function ClarityProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
    if (!projectId) return;

    import("clarity-js").then(({ clarity }) => {
      clarity.start({ projectId });
    });
  }, []);

  return <>{children}</>;
}
