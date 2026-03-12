"use client";

import { useState } from "react";
import { FieldGroup, FieldDescription } from "@/components/ui/field";
import { useAuth } from "../context";
import { resendConfirmationEmail } from "../actions";

export function CheckEmail() {
  const { emailOrPhone, setError } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResend() {
    setResending(true);
    setResent(false);
    const result = await resendConfirmationEmail(emailOrPhone);
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
        <p className="text-balance text-muted-foreground">
          We&apos;ve sent a confirmation link to
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
    </FieldGroup>
  );
}
