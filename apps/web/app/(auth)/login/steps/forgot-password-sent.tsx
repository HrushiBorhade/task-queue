"use client";

import { useState } from "react";
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">Forgot Password</p>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-primary">Check your email</span> to reset your
          password
        </h1>
      </div>

      <div className="rounded-xl border bg-muted/50 px-6 py-5 text-center">
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a password reset link to:
        </p>
        <p className="font-medium mt-1">{emailOrPhone}</p>
        <p className="text-sm text-muted-foreground mt-2">
          Please check your junk/spam folder
        </p>
      </div>

      <div className="flex flex-col gap-4 items-center">
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive it?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-50"
          >
            {resending ? "Sending..." : resent ? "Sent!" : "Resend email"}
          </button>
        </p>

        <button
          type="button"
          onClick={() => setStep("enter-email-or-phone")}
          className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}
