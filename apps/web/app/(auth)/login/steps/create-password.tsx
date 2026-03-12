"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "../context";
import { signUpWithEmail } from "../actions";

export function CreatePassword() {
  const { emailOrPhone, setStep, setError } = useAuth();
  const [password, setLocalPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setValidationError(null);

    if (password.length < 6) {
      setValidationError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setValidationError("Passwords don't match");
      return;
    }

    startTransition(async () => {
      const result = await signUpWithEmail(emailOrPhone, password);

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.success) {
        setStep("check-email");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Looks like it&apos;s your first time here!</p>
        <h1 className="text-lg font-semibold tracking-tight">
          Create Your Account
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => {
              setLocalPassword(e.target.value);
              setValidationError(null);
            }}
            disabled={isPending}
            autoFocus
            minLength={6}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setValidationError(null);
            }}
            disabled={isPending}
          />
        </div>

        {validationError && (
          <p className="text-[10px] text-destructive">{validationError}</p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={isPending || !password || !confirmPassword}
        >
          {isPending ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </div>
  );
}
