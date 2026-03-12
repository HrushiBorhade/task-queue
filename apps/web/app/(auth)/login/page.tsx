"use client";

import { useEffect } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { LazyMotion, m, AnimatePresence, domAnimation } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthProvider, useAuth } from "./context";
import { EnterEmail } from "./steps/enter-email";
import { CreatePassword } from "./steps/create-password";
import { EnterPassword } from "./steps/enter-password";
import { CheckEmail } from "./steps/check-email";
import { OAuthUser } from "./steps/oauth-user";
import { ForgotPasswordSent } from "./steps/forgot-password-sent";
import { track } from "@/lib/analytics";

const STEPS_WITH_BACK = new Set([
  "create-password",
  "enter-password",
  "oauth-user",
  "forgot-password-sent",
  "check-email",
]);

// iOS 26 snappy spring — fast settle, no bounce
const spring = { type: "spring" as const, stiffness: 400, damping: 30 };
// Slightly slower for container height morphing
const containerSpring = { type: "spring" as const, stiffness: 300, damping: 30 };

function StepContent({ step }: { step: string }) {
  switch (step) {
    case "enter-email": return <EnterEmail />;
    case "create-password": return <CreatePassword />;
    case "enter-password": return <EnterPassword />;
    case "check-email": return <CheckEmail />;
    case "oauth-user": return <OAuthUser />;
    case "forgot-password-sent": return <ForgotPasswordSent />;
    default: return null;
  }
}

function StepRenderer() {
  const { step, goBack, error } = useAuth();
  const showBack = STEPS_WITH_BACK.has(step);

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {/* Left side: crossfade step area — iOS 26 pattern */}
          <m.div
            className="relative overflow-hidden"
            layout
            transition={containerSpring}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <m.div
                key={step}
                className="p-6 md:p-8"
                initial={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                transition={spring}
              >
                {showBack && (
                  <div className="mb-4 -ml-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={goBack}
                      aria-label="Go back"
                    >
                      <ArrowLeft />
                    </Button>
                  </div>
                )}

                <AnimatePresence>
                  {error && (
                    <m.div
                      key="error"
                      initial={{ opacity: 0, height: 0, filter: "blur(4px)" }}
                      animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
                      exit={{ opacity: 0, height: 0, filter: "blur(4px)" }}
                      transition={spring}
                      className="mb-4 overflow-hidden"
                    >
                      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {error}
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>

                <StepContent step={step} />
              </m.div>
            </AnimatePresence>
          </m.div>

          {/* Right side: branding + tech stack */}
          <div className="relative hidden bg-muted md:block">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
              <div className="size-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-black">
                Q
              </div>
              <div className="flex flex-col items-center gap-1">
                <h2 className="text-sm font-semibold tracking-tight text-center">
                  Task Queue
                </h2>
                <p className="text-xs text-muted-foreground text-center text-balance leading-relaxed">
                  Distributed task orchestration with real-time monitoring, alerting, and observability.
                </p>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">Backend</span>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {["BullMQ", "Redis", "Supabase", "Drizzle ORM"].map((tag) => (
                      <span key={tag} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {["Prometheus", "Sentry", "Slack Alerts", "Docker"].map((tag) => (
                      <span key={tag} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">Frontend</span>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {["Next.js", "React 19", "Tailwind v4", "shadcn/ui"].map((tag) => (
                      <span key={tag} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {["Motion", "PostHog", "Vercel", "Playwright", "Vitest"].map((tag) => (
                      <span key={tag} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  useEffect(() => {
    track("login_page_viewed", {});
  }, []);

  return (
    <LazyMotion features={domAnimation}>
      <AuthProvider>
        <StepRenderer />
      </AuthProvider>
    </LazyMotion>
  );
}
