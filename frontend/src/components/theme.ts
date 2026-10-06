import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const THEME_KEY = 'psf.theme.v1'
const SIDEBAR_KEY = 'psf.sidebar-collapsed.v1'
const themeListeners = new Set<(theme: Theme) => void>()

function readPreference(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePreference(key: string, value: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  } catch {
    // Appearance remains usable when the browser declines persistence.
  }
}

export function readStoredTheme(): Theme {
  return readPreference(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function initializeTheme(): Theme {
  const theme = readStoredTheme()
  applyTheme(theme)
  return theme
}

export function persistTheme(theme: Theme) {
  writePreference(THEME_KEY, theme)
  applyTheme(theme)
  themeListeners.forEach((listener) => listener(theme))
}

export function readSidebarCollapsed(): boolean {
  return readPreference(SIDEBAR_KEY) === 'true'
}

export function persistSidebarCollapsed(collapsed: boolean) {
  writePreference(SIDEBAR_KEY, String(collapsed))
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  useEffect(() => {
    themeListeners.add(setTheme)
    return () => { themeListeners.delete(setTheme) }
  }, [])
  const toggleTheme = () => persistTheme(theme === 'dark' ? 'light' : 'dark')
  return { theme, toggleTheme }
}
