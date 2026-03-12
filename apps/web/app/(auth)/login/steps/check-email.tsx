"use client";

import { useState } from "react";
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Thank you for creating an account!</p>
        <h1 className="text-lg font-semibold tracking-tight">
          Check Your Email
        </h1>
      </div>

      <div className="rounded-md border bg-muted/50 px-4 py-3 text-center">
        <p className="text-[10px] text-muted-foreground">We&apos;ve sent an email to:</p>
        <p className="text-xs font-medium mt-1">{emailOrPhone}</p>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Please check your junk/spam folder
        </p>
      </div>

      <p className="text-[10px] text-center text-muted-foreground">
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
    </div>
  );
}
