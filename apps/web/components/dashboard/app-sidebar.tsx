"use client";

import Link from "next/link";
import { navItems } from "@/components/dashboard/sidebar-items";
import { NavMain } from "@/components/dashboard/nav-main";
import { NavUser } from "@/components/dashboard/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: { email: string; role: string };
}

function SidebarLogo() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* Expanded: logo + toggle */}
        <div className="flex items-center justify-between group-data-[collapsible=icon]:hidden">
          <Link href="/dashboard/tasks" className="flex items-center h-10 px-2">
            <div className="size-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground text-xs font-black">
              Q
            </div>
            <span className="ml-2 text-sm font-semibold tracking-tight">
              Task Queue
            </span>
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger className="size-8 shrink-0 cursor-pointer [&_svg]:size-4 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            </TooltipTrigger>
            <TooltipContent side="right">Toggle Sidebar</TooltipContent>
          </Tooltip>
        </div>
        {/* Collapsed: just the expand trigger centered */}
        <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger className="size-8 cursor-pointer [&_svg]:size-4 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            </TooltipTrigger>
            <TooltipContent side="right">Toggle Sidebar</TooltipContent>
          </Tooltip>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || user.role === "admin"
  );

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarLogo />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={visibleItems} label="Navigation" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
