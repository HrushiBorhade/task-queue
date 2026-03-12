"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleLogo } from "@phosphor-icons/react";
import { useAuth } from "../context";
import { signInWithGoogle } from "../actions";

const SUPPORTED_PROVIDERS: Record<string, { label: string; icon: React.ReactNode; action: () => Promise<{ error: string } | void> }> = {
  google: { label: "Google", icon: <GoogleLogo data-icon="inline-start" weight="bold" />, action: signInWithGoogle },
};

export function OAuthUser() {
  const { emailOrPhone, oauthProvider, setError } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const supported = oauthProvider ? SUPPORTED_PROVIDERS[oauthProvider] : null;
  const providerLabel = supported?.label ?? oauthProvider ?? "an external provider";

  async function handleContinueWithProvider() {
    if (!supported) {
      setError(`Sign-in with ${providerLabel} is not supported yet.`);
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Welcome back!</p>
        <h1 className="text-lg font-semibold tracking-tight">
          You signed up with {providerLabel}
        </h1>
      </div>

      <div className="rounded-md border bg-muted/50 px-4 py-3 text-center">
        <p className="text-[10px] text-muted-foreground">
          The account associated with
        </p>
        <p className="text-xs font-medium mt-1">{emailOrPhone}</p>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          was created using {providerLabel}. Sign in with {providerLabel} to continue.
        </p>
      </div>

      <Button
        onClick={handleContinueWithProvider}
        size="lg"
        disabled={isPending}
      >
        {supported?.icon}
        {isPending ? "Redirecting..." : `Continue with ${providerLabel}`}
      </Button>
    </div>
  );
}
