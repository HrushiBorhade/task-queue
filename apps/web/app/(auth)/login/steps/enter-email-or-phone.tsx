"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldDescription,
} from "@/components/ui/field";
import { GoogleLogo } from "@phosphor-icons/react";
import { useAuth } from "../context";
import { checkUserExists, signInWithGoogle } from "../actions";

export function EnterEmailOrPhone() {
  const { setStep, emailOrPhone, setEmailOrPhone, setInputType, setIsNewUser, setOauthProvider, setError } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [googlePending, setGooglePending] = useState(false);

  function handleContinue() {
    if (!emailOrPhone.trim()) return;

    startTransition(async () => {
      setError(null);
      const result = await checkUserExists(emailOrPhone);
      setInputType(result.type);
      setEmailOrPhone(result.normalized);
      setIsNewUser(!result.exists);

      if (result.type === "phone") {
        setStep("verify-otp");
      } else if (result.exists && result.provider && !result.hasPassword) {
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
    const result = await signInWithGoogle();
    if (result?.error) {
      setError(result.error);
      setGooglePending(false);
    }
  }

  const busy = isPending || googlePending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleContinue();
      }}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">Welcome</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Sign in or create your Task Queue account
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email-or-phone">Email or phone</FieldLabel>
          <Input
            id="email-or-phone"
            placeholder="m@example.com"
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </Field>
        <Field>
          <Button type="submit" disabled={busy || !emailOrPhone.trim()}>
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
            <GoogleLogo data-icon="inline-start" weight="bold" />
            Google
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
