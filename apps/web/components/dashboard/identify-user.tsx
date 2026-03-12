"use client";

import { useEffect } from "react";
import { identifyUser } from "@/lib/analytics";

export function IdentifyUser({ userId, email }: { userId: string; email: string }) {
  useEffect(() => {
    identifyUser(userId, email);
  }, [userId, email]);

  return null;
}
