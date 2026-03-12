import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh w-full">
      {/* Left panel — decorative, hidden on mobile */}
      <div className="hidden md:flex md:w-[min(30rem,40%)] flex-col justify-between bg-zinc-950 text-white p-10 relative overflow-hidden">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/80 via-zinc-950 to-zinc-950" />

        {/* Floating shapes */}
        <div className="absolute top-20 left-10 size-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-40 right-10 size-40 rounded-full bg-primary/5 blur-3xl" />

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-black">
              Q
            </div>
            Task Queue
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-4">
          <h2 className="text-2xl font-bold tracking-tight">
            Async Task Orchestration
          </h2>
          <p className="text-zinc-400 leading-relaxed">
            Distribute, monitor, and manage background tasks at scale.
            Built with BullMQ, Redis, and real-time observability.
          </p>
          <div className="flex gap-3 mt-2">
            {["BullMQ", "Redis", "Supabase", "Next.js"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400"
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
        <div className="md:hidden p-6">
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-black">
              Q
            </div>
            Task Queue
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 md:p-10">
          {children}
        </div>
      </div>
    </div>
  );
}
