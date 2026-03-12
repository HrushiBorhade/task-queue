"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "../context";
import { sendPhoneOtp, verifyPhoneOtp } from "../actions";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30;

export function VerifyOtp() {
  const { emailOrPhone, setError } = useAuth();
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [isPending, startTransition] = useTransition();
  const [sendingOtp, setSendingOtp] = useState(false);
  const otpSentRef = useRef(false);

  const sendOtp = useCallback(async () => {
    setSendingOtp(true);
    const result = await sendPhoneOtp(emailOrPhone);
    setSendingOtp(false);
    otpSentRef.current = true;
    if (result?.error) {
      setError(result.error);
    } else {
      setCountdown(RESEND_COOLDOWN);
    }
  }, [emailOrPhone, setError]);

  useEffect(() => {
    sendOtp();
  }, [sendOtp]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleVerify = useCallback(() => {
    if (otp.length !== OTP_LENGTH || !otpSentRef.current) return;

    startTransition(async () => {
      setError(null);
      const result = await verifyPhoneOtp(emailOrPhone, otp);
      if (result?.error) {
        setError(result.error);
        setOtp("");
      }
    });
  }, [otp, emailOrPhone, setError]);

  useEffect(() => {
    if (otp.length === OTP_LENGTH) {
      handleVerify();
    }
  }, [otp, handleVerify]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {sendingOtp ? "Sending code..." : "We sent a code to your phone"}
        </p>
        <h1 className="text-lg font-semibold tracking-tight">
          Verify Your Phone Number
        </h1>
      </div>

      <div className="rounded-md border bg-muted/50 px-3 py-2 text-center">
        <p className="text-[10px] text-muted-foreground">We&apos;ve sent a 6 digit code to:</p>
        <p className="text-xs font-medium">{emailOrPhone}</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <InputOTP
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={setOtp}
          disabled={isPending}
          autoFocus
        >
          <InputOTPGroup>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>

        <p className="text-[10px] text-muted-foreground">
          {countdown > 0 ? (
            `Resend OTP in ${countdown}s`
          ) : (
            <button
              type="button"
              onClick={sendOtp}
              disabled={sendingOtp}
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Resend OTP
            </button>
          )}
        </p>
      </div>

      <Button
        onClick={handleVerify}
        size="lg"
        disabled={isPending || otp.length !== OTP_LENGTH}
      >
        {isPending ? "Verifying..." : "Verify"}
      </Button>
    </div>
  );
}
