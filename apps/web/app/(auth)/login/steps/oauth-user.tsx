"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
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
    <FieldGroup>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-balance text-muted-foreground">
          <strong>{emailOrPhone}</strong> was created using {providerLabel}.
          Sign in with {providerLabel} to continue.
        </p>
      </div>
      <Field>
        <Button onClick={handleContinueWithProvider} disabled={isPending}>
          {supported?.icon}
          {isPending ? "Redirecting..." : `Continue with ${providerLabel}`}
        </Button>
      </Field>
    </FieldGroup>
  );
}
