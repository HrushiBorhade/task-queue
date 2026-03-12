"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  function handleToggle() {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
    track("theme_toggled", { theme: next });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label="Toggle theme"
    >
      <Sun data-icon weight="bold" className="scale-100 dark:scale-0 transition-transform" />
      <Moon data-icon weight="bold" className="absolute scale-0 dark:scale-100 transition-transform" />
    </Button>
  );
}
