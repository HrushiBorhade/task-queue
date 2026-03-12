"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context";
import { signInWithGoogle } from "../actions";

const SUPPORTED_PROVIDERS: Record<string, { label: string; action: () => Promise<{ error: string } | void> }> = {
  google: { label: "Google", action: signInWithGoogle },
};

export function OAuthUser() {
  const { emailOrPhone, oauthProvider, setError } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const supported = oauthProvider ? SUPPORTED_PROVIDERS[oauthProvider] : null;
  const providerLabel = supported?.label ?? oauthProvider ?? "an external provider";

  async function handleContinueWithProvider() {
    if (!supported) {
      setError(`Sign-in with ${providerLabel} is not supported yet. Please contact support.`);
      return;
    }

    setIsPending(true);
    setError(null);
    const result = await supported.action();
    if (result?.error) {
      setError(result.error);
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">Welcome back!</p>
        <h1 className="text-3xl font-bold tracking-tight">
          You signed up with{" "}
          <span className="text-primary">{providerLabel}</span>
        </h1>
      </div>

      <div className="rounded-xl border bg-muted/50 px-6 py-5 text-center">
        <p className="text-sm text-muted-foreground">
          The account associated with
        </p>
        <p className="font-medium mt-1">{emailOrPhone}</p>
        <p className="text-sm text-muted-foreground mt-2">
          was created using {providerLabel}. Please sign in with {providerLabel}{" "}
          to continue.
        </p>
      </div>

      <Button
        onClick={handleContinueWithProvider}
        disabled={isPending}
        className="h-12 text-base font-semibold"
      >
        {isPending ? "Redirecting..." : `Continue with ${providerLabel}`}
      </Button>
    </div>
  );
}
