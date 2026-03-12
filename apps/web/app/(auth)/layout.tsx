import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh w-full">
      {/* Left panel — decorative, hidden on mobile */}
      <div className="hidden md:flex md:w-[min(28rem,40%)] flex-col justify-between bg-foreground text-background p-8 relative overflow-hidden">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/80 via-foreground to-foreground" />

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 text-xs font-bold tracking-tight">
            <div className="size-6 rounded-md bg-primary-foreground flex items-center justify-center text-foreground text-[10px] font-black">
              Q
            </div>
            Task Queue
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Async Task Orchestration
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Distribute, monitor, and manage background tasks at scale.
            Built with BullMQ, Redis, and real-time observability.
          </p>
          <div className="flex gap-2 mt-1">
            {["BullMQ", "Redis", "Supabase", "Next.js"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-muted-foreground/30 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col">
        {/* Mobile logo */}
        <div className="md:hidden p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold tracking-tight">
            <div className="size-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-black">
              Q
            </div>
            Task Queue
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
