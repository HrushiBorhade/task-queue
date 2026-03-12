"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { useAuth } from "../context";
import { signUpWithEmail } from "../actions";
import { track } from "@/lib/analytics";

export function CreatePassword() {
  const { email, setStep, setError } = useAuth();
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
      track("login_email_password_submitted", { is_new_user: true });
      const result = await signUpWithEmail(email, password);

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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="text-sm text-balance text-muted-foreground">{email}</p>
        </div>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
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
            minLength={6}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setValidationError(null);
            }}
            disabled={isPending}
            required
          />
        </Field>
        {validationError && <FieldError>{validationError}</FieldError>}
        <Field>
          <Button type="submit" disabled={isPending || !password || !confirmPassword}>
            {isPending ? "Creating account..." : "Create account"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
