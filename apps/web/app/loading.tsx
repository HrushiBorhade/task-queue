import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-9 w-40 rounded-md" />
    </div>
  );
}
