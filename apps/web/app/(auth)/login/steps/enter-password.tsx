"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useAuth } from "../context";
import { signInWithPassword, resetPasswordForEmail, checkUserExists } from "../actions";

export function EnterPassword() {
  const { email, setStep, setOauthProvider, setError } = useAuth();
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [resetPending, setResetPending] = useState(false);

  function handleSubmit() {
    if (!password) return;

    startTransition(async () => {
      setError(null);
      const result = await signInWithPassword(email, password);
      if (result?.error) {
        if (result.error === "Invalid login credentials") {
          const check = await checkUserExists(email);
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
    const result = await resetPasswordForEmail(email);
    setResetPending(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setStep("forgot-password-sent");
    }
  }

  const busy = isPending || resetPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-balance text-muted-foreground">{email}</p>
        </div>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              className="ml-auto text-xs underline-offset-2 hover:underline disabled:opacity-50"
            >
              {resetPending ? "Sending..." : "Forgot your password?"}
            </button>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            disabled={busy}
            autoFocus
            required
          />
        </Field>
        <Field>
          <Button type="submit" disabled={busy || !password}>
            {isPending ? "Signing in..." : "Login"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
