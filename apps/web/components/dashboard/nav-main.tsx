"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LazyMotion, m, domAnimation } from "motion/react";
import type { NavItem } from "@/components/dashboard/sidebar-items";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
  label,
}: {
  items: NavItem[];
  label: string;
}) {
  const pathname = usePathname();

  return (
    <LazyMotion features={domAnimation}>
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isActive =
            item.url === "/dashboard"
              ? pathname === "/dashboard" || pathname.startsWith("/dashboard/tasks")
              : pathname === item.url || pathname.startsWith(item.url + "/");

          return (
            <SidebarMenuItem key={item.title} className="relative">
              {isActive && (
                <m.div
                  layoutId="sidebar-active-indicator"
                  className="absolute inset-0 rounded-[calc(var(--radius-sm)+2px)] bg-sidebar-accent"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={isActive}
                className={isActive ? "data-active:bg-transparent" : ""}
              >
                <Link href={item.url}>
                  <item.icon
                    weight="duotone"
                    className="relative z-10"
                  />
                  <span className="relative z-10">{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
    </LazyMotion>
  );
}
