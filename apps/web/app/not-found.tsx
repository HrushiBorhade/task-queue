import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-sm font-semibold">404 — Not Found</h2>
        <p className="text-xs text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
