"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      <Sun data-icon weight="bold" className="scale-100 dark:scale-0 transition-transform" />
      <Moon data-icon weight="bold" className="absolute scale-0 dark:scale-100 transition-transform" />
    </Button>
  );
}
