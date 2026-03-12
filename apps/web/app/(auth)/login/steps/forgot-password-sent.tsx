"use client";

import { useState } from "react";
import { FieldGroup, FieldDescription } from "@/components/ui/field";
import { useAuth } from "../context";
import { resetPasswordForEmail } from "../actions";

export function ForgotPasswordSent() {
  const { emailOrPhone, setStep, setError } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResend() {
    setResending(true);
    setResent(false);
    const result = await resetPasswordForEmail(emailOrPhone);
    setResending(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setResent(true);
    }
  }

  return (
    <FieldGroup>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-sm text-balance text-muted-foreground">
          We&apos;ve sent a password reset link to
        </p>
        <p className="font-medium">{emailOrPhone}</p>
      </div>
      <FieldDescription className="text-center">
        Didn&apos;t receive it?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="underline underline-offset-4 hover:text-primary disabled:opacity-50"
        >
          {resending ? "Sending..." : resent ? "Sent!" : "Resend email"}
        </button>
      </FieldDescription>
      <FieldDescription className="text-center">
        <button
          type="button"
          onClick={() => setStep("enter-email-or-phone")}
          className="underline underline-offset-4 hover:text-primary"
        >
          Back to sign in
        </button>
      </FieldDescription>
    </FieldGroup>
  );
}
