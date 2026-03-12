import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-48" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-10" /></TableCell>
          <TableCell className="text-right"><Skeleton className="ml-auto h-3.5 w-12" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]"><Skeleton className="h-3.5 w-12" /></TableHead>
            <TableHead><Skeleton className="h-3.5 w-14" /></TableHead>
            <TableHead className="w-[100px]"><Skeleton className="h-3.5 w-12" /></TableHead>
            <TableHead className="w-[120px]"><Skeleton className="h-3.5 w-16" /></TableHead>
            <TableHead className="w-[80px] text-right"><Skeleton className="ml-auto h-3.5 w-10" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SkeletonRows />
        </TableBody>
      </Table>
    </div>
  );
}
