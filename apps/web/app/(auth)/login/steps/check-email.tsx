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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">Thank you for creating an account!</p>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-primary">Check Your Email</span> For The Next Steps!
        </h1>
      </div>

      <div className="rounded-xl border bg-muted/50 px-6 py-5 text-center">
        <p className="text-sm text-muted-foreground">We&apos;ve sent an email to:</p>
        <p className="font-medium mt-1">{emailOrPhone}</p>
        <p className="text-sm text-muted-foreground mt-2">
          Please check your junk/spam folder
        </p>
      </div>

      <p className="text-sm text-center text-muted-foreground">
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
