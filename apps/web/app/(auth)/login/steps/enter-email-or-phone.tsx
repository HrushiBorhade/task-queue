"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">
          Sign in or Create account
        </h1>
        <p className="text-xs text-muted-foreground">
          Enter your email or phone number to get started.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email-or-phone" className="sr-only">
            Email or phone number
          </Label>
          <Input
            id="email-or-phone"
            placeholder="Email or phone number"
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={busy || !emailOrPhone.trim()}
        >
          {isPending ? "Checking..." : "Continue"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-[10px] uppercase tracking-wider">or</span>
        <Separator className="flex-1" />
      </div>

      <Button
        variant="outline"
        size="lg"
        onClick={handleGoogle}
        disabled={busy}
      >
        <GoogleLogo data-icon="inline-start" weight="bold" />
        Continue with Google
      </Button>
    </div>
  );
}
