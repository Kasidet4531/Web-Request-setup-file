import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NavSidebar } from './NavSidebar'
import { navSectionsForRole, resolveActivePath } from './navigationState'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children?: unknown; to?: string }) =>
    createElement('a', { href: to }, children as never),
  useRouterState: () => '/admin/autofill',
}))

describe('NavSidebar', () => {
  it('offers direct links to admin tools for admins', () => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role: 'admin' }))

    expect(html).toContain('href="/admin/users"')
    expect(html).toContain('href="/admin/form-config"')
    expect(html).toContain('href="/admin/workflow"')
    expect(html).toContain('href="/admin/autofill"')
    expect(html).toContain('href="/history"')
  })

  it('removes collapsed navigation from presentation and keyboard interaction', () => {
    const html = renderToStaticMarkup(
      createElement(NavSidebar, { collapsed: true, role: 'admin' }),
    )

    expect(html).toContain('class="app-sidebar app-sidebar--collapsed"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('inert=""')
    expect(html).toContain('href="/admin/users"')
  })

  it('hides admin-only and requester-only entries from setup owners', () => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role: 'setup_owner' }))

    expect(html).toContain('href="/requests"')
    expect(html).not.toContain('/admin/')
    expect(html).not.toContain('/requests/new')
    expect(html).not.toContain('href="/history"')
  })

  it('keeps requester entries for requesters without admin tools', () => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role: 'requester' }))

    expect(html).toContain('href="/requests/new"')
    expect(html).toContain('href="/admin/export-profile"')
    expect(html).not.toContain('href="/admin/users"')
  })
})

describe('resolveActivePath', () => {
  const sections = navSectionsForRole('admin')

  it('prefers the exact route over a section prefix', () => {
    expect(resolveActivePath('/requests/new', sections)).toBe('/requests/new')
    expect(resolveActivePath('/requests/', sections)).toBe('/requests')
  })

  it('falls back to the longest matching section prefix', () => {
    expect(resolveActivePath('/requests/0f1e2d3c/history', sections)).toBe('/requests')
    expect(resolveActivePath('/dashboard', sections)).toBe('/dashboard')
    expect(resolveActivePath('/unknown', sections)).toBeNull()
  })
})
