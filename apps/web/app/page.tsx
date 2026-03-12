import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOut } from "./(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateTaskForm } from "@/components/create-task-form";

export default async function Home() {
  const user = await getUser();
  if (!user) return null;

  const supabase = createAdminClient();

  const { data: taskList } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="min-h-svh p-6">
      <div className="mx-auto max-w-4xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {user.email} &middot; {user.role}
            </p>
          </div>
          <form action={signOut}>
            <Button variant="outline" size="sm">Sign out</Button>
          </form>
        </div>

        <CreateTaskForm />

        <Card>
          <CardHeader>
            <CardTitle>Recent Tasks</CardTitle>
            <CardDescription>Your last 20 tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {!taskList || taskList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks yet. Create one above.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {taskList.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{task.type}</span>
                        <StatusBadge status={task.status} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-md">
                        {(task.input as { prompt?: string })?.prompt}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {task.progress}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-800",
  active: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-800";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}
