import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { BreadcrumbNav } from "@/components/dashboard/breadcrumb-nav";
import { IdentifyUser } from "@/components/dashboard/identify-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await getUser();
  } catch {
    redirect("/login");
  }
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <>
    <IdentifyUser userId={user.id} email={user.email} />
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultOpen} className="h-svh !min-h-0 overflow-hidden">
        <AppSidebar user={{ email: user.email, role: user.role }} />
        <SidebarInset className="min-w-0 overflow-hidden">
          {/* Header with sidebar trigger + breadcrumb */}
          <header className="flex h-12 shrink-0 items-center gap-2 px-4">
            <SidebarTrigger className="lg:hidden size-8 cursor-pointer [&_svg]:size-4" />
            <Separator orientation="vertical" className="mr-2 h-4 lg:hidden" />
            <BreadcrumbNav />
          </header>
          {/* Scrollable content area with scroll fades */}
          <div className="relative flex-1 min-w-0 overflow-hidden">
            <div className="pointer-events-none absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-background to-transparent z-10" />
            <div className="h-full overflow-y-auto overflow-x-hidden px-4 pb-4 pt-2 lg:px-6 lg:pb-6 lg:pt-3">
              {children}
            </div>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-background to-transparent z-10" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
    </>
  );
}
