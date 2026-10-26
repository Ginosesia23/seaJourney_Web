"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { type ThemeProviderProps } from "next-themes/dist/types"

import { setCalendarAppearance } from "@/lib/calendar-state-colors"

function CalendarAppearanceSync() {
  const { resolvedTheme } = useTheme()

  React.useEffect(() => {
    const next =
      resolvedTheme === "dark" ||
      (typeof document !== "undefined" && document.documentElement.classList.contains("dark"))
        ? "dark"
        : "light"
    setCalendarAppearance(next)
  }, [resolvedTheme])

  return null
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <CalendarAppearanceSync />
      {children}
    </NextThemesProvider>
  )
}
