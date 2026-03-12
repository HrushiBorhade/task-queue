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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">Look&apos;s like it&apos;s your first time here!</p>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-primary">Add A Password</span> To Create Your Account
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => {
              setLocalPassword(e.target.value);
              setValidationError(null);
            }}
            disabled={isPending}
            autoFocus
            className="h-12 text-base"
            minLength={6}
          />
        </div>

        <div className="flex flex-col gap-2">
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
            className="h-12 text-base"
          />
        </div>

        {validationError && (
          <p className="text-sm text-destructive">{validationError}</p>
        )}

        <Button
          type="submit"
          disabled={isPending || !password || !confirmPassword}
          className="h-12 text-base font-semibold"
        >
          {isPending ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </div>
  );
}
