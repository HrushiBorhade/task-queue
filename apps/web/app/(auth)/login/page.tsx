"use client";

import { ArrowLeft } from "lucide-react";
import { AuthProvider, useAuth } from "./context";
import { EnterEmailOrPhone } from "./steps/enter-email-or-phone";
import { CreatePassword } from "./steps/create-password";
import { EnterPassword } from "./steps/enter-password";
import { VerifyOtp } from "./steps/verify-otp";
import { CheckEmail } from "./steps/check-email";
import { OAuthUser } from "./steps/oauth-user";
import { ForgotPasswordSent } from "./steps/forgot-password-sent";

const STEPS_WITH_BACK = new Set(["create-password", "enter-password", "verify-otp", "oauth-user", "forgot-password-sent", "check-email"]);

function StepRenderer() {
  const { step, goBack, error } = useAuth();

  return (
    <div className="w-full max-w-md mx-auto">
      {STEPS_WITH_BACK.has(step) && (
        <button
          type="button"
          onClick={goBack}
          className="mb-8 p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
          {error}
        </div>
      )}

      <div
        key={step}
        className="animate-in fade-in slide-in-from-right-4 duration-300"
      >
        {step === "enter-email-or-phone" && <EnterEmailOrPhone />}
        {step === "create-password" && <CreatePassword />}
        {step === "enter-password" && <EnterPassword />}
        {step === "verify-otp" && <VerifyOtp />}
        {step === "check-email" && <CheckEmail />}
        {step === "oauth-user" && <OAuthUser />}
        {step === "forgot-password-sent" && <ForgotPasswordSent />}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <StepRenderer />
    </AuthProvider>
  );
}
