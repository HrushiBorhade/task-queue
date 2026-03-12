"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
        // OAuth-only user (e.g. signed up with Google, no password set)
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Sign in or Create account
        </h1>
        <p className="text-muted-foreground">
          Enter your email or phone number below and we&apos;ll get you signed
          in or set up with a new account.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
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
            className="h-12 text-base"
          />
        </div>

        <Button
          type="submit"
          disabled={busy || !emailOrPhone.trim()}
          className="h-12 text-base font-semibold"
        >
          {isPending ? "Checking..." : "Continue"}
        </Button>
      </form>

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-sm uppercase tracking-wider">or</span>
        <Separator className="flex-1" />
      </div>

      <Button
        variant="outline"
        className="h-12 text-base"
        onClick={handleGoogle}
        disabled={busy}
      >
        <svg viewBox="0 0 24 24" className="size-5 mr-2">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </Button>
    </div>
  );
}
