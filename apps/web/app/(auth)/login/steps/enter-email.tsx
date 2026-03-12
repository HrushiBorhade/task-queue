"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { GoogleIcon } from "@/components/icons/google";
import { useAuth } from "../context";
import { checkUserExists, signInWithGoogle } from "../actions";
import { track } from "@/lib/analytics";

export function EnterEmail() {
  const { setStep, email, setEmail, setIsNewUser, setOauthProvider, setError } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [googlePending, setGooglePending] = useState(false);

  function handleContinue() {
    if (!email.trim()) return;

    startTransition(async () => {
      setError(null);
      track("login_email_submitted", { email_domain: email.split("@")[1] ?? "unknown" });
      const result = await checkUserExists(email);
      setEmail(result.normalized);
      setIsNewUser(!result.exists);

      if (result.exists && result.provider && !result.hasPassword) {
        setOauthProvider(result.provider);
        setStep("oauth-user");
      } else if (result.exists) {
        setStep("enter-password");
      } else {
        setStep("create-password");
      }
    });
  }

  async function handleGoogle() {
    setGooglePending(true);
    setError(null);
    track("login_google_clicked", {});
    const result = await signInWithGoogle();
    if (result?.error) {
      setError(result.error);
      setGooglePending(false);
    }
  }

  const busy = isPending || googlePending;

  return (
    <form
      action={() => handleContinue()}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">Welcome</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Sign in or create your Task Queue account
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            placeholder="m@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field>
          <Button type="submit" disabled={busy || !email.trim()}>
            {isPending ? "Checking..." : "Continue"}
          </Button>
        </Field>
        <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
          Or continue with
        </FieldSeparator>
        <Field>
          <Button
            variant="outline"
            type="button"
            onClick={handleGoogle}
            disabled={busy}
          >
            <GoogleIcon data-icon="inline-start" />
            Google
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
