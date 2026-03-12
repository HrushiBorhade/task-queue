import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Task Queue",
  description: "Distributed async task orchestration platform",
};

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="size-14 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-2xl font-black">
          Q
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Task Queue</h1>
          <p className="max-w-md text-sm text-muted-foreground text-balance leading-relaxed">
            Distributed async task orchestration with real-time monitoring,
            scheduling, alerting, and observability.
          </p>
        </div>
        <div className="flex flex-col items-center gap-4 mt-2">
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">Backend</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {["BullMQ", "Redis", "Supabase", "Drizzle ORM", "Prometheus", "Sentry", "Docker"].map(
                (tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-2.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">Frontend</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {["Next.js", "React 19", "Tailwind v4", "shadcn/ui", "TanStack Query", "Motion", "PostHog", "Playwright", "Vitest"].map(
                (tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-2.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
      <Button asChild>
        <Link href="/dashboard">
          Go to Dashboard
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}
