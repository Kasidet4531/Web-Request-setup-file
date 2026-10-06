import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTheme, persistTheme, readStoredTheme, persistSidebarCollapsed, readSidebarCollapsed } from './theme'

describe('browser appearance persistence', () => {
  let preferences: Map<string, string>
  let classes: Set<string>
  beforeEach(() => {
    preferences = new Map()
    classes = new Set()
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value) } })
    vi.stubGlobal('document', { documentElement: { classList: { toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name) } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('initializes Light without writing a preference on a first visit', () => {
    classes.add('dark')
    expect(initializeTheme()).toBe('light')
    expect(classes.has('dark')).toBe(false)
    expect(preferences.size).toBe(0)
  })
  it('restores the explicit theme and applies both Dark and Light selections', () => {
    persistTheme('dark')
    expect(readStoredTheme()).toBe('dark')
    classes.clear()
    expect(initializeTheme()).toBe('dark')
    expect(classes.has('dark')).toBe(true)
    persistTheme('light')
    expect(readStoredTheme()).toBe('light')
    expect(classes.has('dark')).toBe(false)
  })
  it('falls back to Light for invalid stored theme values', () => {
    preferences.set('psf.theme.v1', 'system')
    expect(initializeTheme()).toBe('light')
  })
  it('retains both collapsed and expanded navigation preferences', () => {
    expect(readSidebarCollapsed()).toBe(false)
    persistSidebarCollapsed(true)
    expect(readSidebarCollapsed()).toBe(true)
    persistSidebarCollapsed(false)
    expect(readSidebarCollapsed()).toBe(false)
  })
  it('keeps theme selection usable when browser storage is blocked', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('Storage disabled') } })
    expect(initializeTheme()).toBe('light')
    expect(() => persistTheme('dark')).not.toThrow()
    expect(classes.has('dark')).toBe(true)
    expect(() => persistSidebarCollapsed(true)).not.toThrow()
  })
})
