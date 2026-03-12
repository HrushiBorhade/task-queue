"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "../context";
import { signInWithPassword, resetPasswordForEmail, checkUserExists } from "../actions";

export function EnterPassword() {
  const { emailOrPhone, setStep, setOauthProvider, setError } = useAuth();
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [resetPending, setResetPending] = useState(false);

  function handleSubmit() {
    if (!password) return;

    startTransition(async () => {
      setError(null);
      const result = await signInWithPassword(emailOrPhone, password);
      if (result?.error) {
        if (result.error === "Invalid login credentials") {
          const check = await checkUserExists(emailOrPhone);
          if (check.exists && check.provider && !check.hasPassword) {
            setOauthProvider(check.provider);
            setStep("oauth-user");
            return;
          }
        }
        setError(result.error);
      }
    });
  }

  async function handleForgotPassword() {
    setResetPending(true);
    setError(null);
    const result = await resetPasswordForEmail(emailOrPhone);
    setResetPending(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setStep("forgot-password-sent");
    }
  }

  const busy = isPending || resetPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Welcome back!</p>
        <h1 className="text-lg font-semibold tracking-tight">
          Enter Your Password
        </h1>
      </div>

      <div className="rounded-md border bg-muted/50 px-3 py-2 text-center text-xs font-medium">
        {emailOrPhone}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              className="text-[10px] text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-50"
            >
              {resetPending ? "Sending..." : "Forgot password?"}
            </button>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            disabled={busy}
            autoFocus
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={busy || !password}
        >
          {isPending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
