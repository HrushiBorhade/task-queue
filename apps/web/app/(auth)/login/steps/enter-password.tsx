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
        // Fallback: if password login fails, re-check if this is an OAuth-only user.
        // Handles edge case where upfront detection missed it.
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">Welcome back!</p>
        <h1 className="text-3xl font-bold tracking-tight">
          Enter Your <span className="text-primary">Password</span>
        </h1>
      </div>

      <div className="rounded-xl border bg-muted/50 px-4 py-3 text-center text-sm font-medium">
        {emailOrPhone}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              className="text-sm text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-50"
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
            className="h-12 text-base"
          />
        </div>

        <Button
          type="submit"
          disabled={busy || !password}
          className="h-12 text-base font-semibold"
        >
          {isPending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
