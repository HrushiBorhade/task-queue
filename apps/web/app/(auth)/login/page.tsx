"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthProvider, useAuth } from "./context";
import { EnterEmail } from "./steps/enter-email";
import { CreatePassword } from "./steps/create-password";
import { EnterPassword } from "./steps/enter-password";
import { CheckEmail } from "./steps/check-email";
import { OAuthUser } from "./steps/oauth-user";
import { ForgotPasswordSent } from "./steps/forgot-password-sent";

const STEPS_WITH_BACK = new Set([
  "create-password",
  "enter-password",
  "oauth-user",
  "forgot-password-sent",
  "check-email",
]);

function StepRenderer() {
  const { step, goBack, error } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            {STEPS_WITH_BACK.has(step) && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goBack}
                className="mb-4 -ml-1"
                aria-label="Go back"
              >
                <ArrowLeft />
              </Button>
            )}

            {error && (
              <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                {error}
              </div>
            )}

            <div
              key={step}
              className="animate-in fade-in slide-in-from-right-4 duration-300"
            >
              {step === "enter-email" && <EnterEmail />}
              {step === "create-password" && <CreatePassword />}
              {step === "enter-password" && <EnterPassword />}
              {step === "check-email" && <CheckEmail />}
              {step === "oauth-user" && <OAuthUser />}
              {step === "forgot-password-sent" && <ForgotPasswordSent />}
            </div>
          </div>
          <div className="relative hidden bg-muted md:block">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8">
              <div className="size-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-black">
                Q
              </div>
              <h2 className="text-sm font-semibold tracking-tight text-center">
                Task Queue
              </h2>
              <p className="text-xs text-muted-foreground text-center text-balance leading-relaxed">
                Distribute, monitor, and manage background tasks at scale.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {["BullMQ", "Redis", "Supabase", "Next.js"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
