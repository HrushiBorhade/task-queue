import type { ElementType } from "react";
import {
  ListChecks,
  Lightning,
  CalendarDots,
  Heartbeat,
} from "@phosphor-icons/react/dist/ssr";

export type NavItem = {
  title: string;
  url: string;
  icon: ElementType;
  adminOnly?: boolean;
};

export const navItems: NavItem[] = [
  {
    title: "Tasks",
    url: "/dashboard",
    icon: ListChecks,
  },
  {
    title: "Batches",
    url: "/dashboard/batches",
    icon: Lightning,
  },
  {
    title: "Schedules",
    url: "/dashboard/schedules",
    icon: CalendarDots,
  },
  {
    title: "Queue Health",
    url: "/dashboard/queue-health",
    icon: Heartbeat,
    adminOnly: true,
  },
];
