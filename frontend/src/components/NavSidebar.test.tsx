import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NavSidebar } from './NavSidebar'
import { contextualAdminSections, navSectionsForRole, resolveActivePath } from './navigationState'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children?: unknown; to?: string }) =>
    createElement('a', { href: to }, children as never),
  useRouterState: () => '/admin/autofill',
}))

describe('NavSidebar', () => {
  it('offers direct links to every admin tool in the mobile drawer', () => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role: 'admin', mobile: true }))

    expect(html).toContain('href="/admin/users"')
    expect(html).toContain('href="/admin/form-config"')
    expect(html).toContain('href="/admin/workflow"')
    expect(html).toContain('href="/admin/autofill"')
    expect(html).toContain('href="/history"')
  })

  it.each(['requester', 'setup_owner'] as const)('filters the mobile drawer by the authenticated %s role', (role) => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role, mobile: true }))
    for (const route of ['/dashboard', '/requests', '/my-drafts', '/requests/new']) expect(html).toContain(`href="${route}"`)
    for (const route of ['/admin/users', '/admin/form-config', '/admin/workflow', '/admin/autofill', '/history']) expect(html).not.toContain(`href="${route}"`)
    expect(html.includes('href="/admin/export-profile"')).toBe(role === 'requester')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Close navigation"')
  })

  it('keeps desktop work destinations and moves tools behind the admin destination', () => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role: 'admin' }))
    for (const route of ['/dashboard', '/requests', '/my-drafts', '/history', '/admin/export-profile', '/admin']) expect(html).toContain(`href="${route}"`)
    expect(html).not.toContain('href="/admin/users"')
    expect(html).not.toContain('href="/requests/new"')
  })

  it('groups every authorized tool contextually without exposing admin tools to other roles', () => {
    const sections = contextualAdminSections('admin')
    expect(sections.map((section) => section.label)).toEqual(['Request configuration', 'Access', 'Reporting'])
    expect(sections.flatMap((section) => section.items).map((item) => item.to)).toEqual(['/admin/form-config', '/admin/workflow', '/admin/autofill', '/admin/users', '/admin/export-profile', '/history'])
    expect(contextualAdminSections('requester')).toEqual([])
    expect(contextualAdminSections('setup_owner')).toEqual([])
    expect(resolveActivePath('/admin/form-config/2', sections)).toBe('/admin/form-config')
  })

  it('removes collapsed navigation from presentation and keyboard interaction', () => {
    const html = renderToStaticMarkup(
      createElement(NavSidebar, { collapsed: true, role: 'admin' }),
    )

    expect(html).toContain('class="app-sidebar app-sidebar--collapsed"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('inert=""')
    expect(html).toContain('href="/admin"')
  })

  it('offers Create Request and My drafts to every authenticated role immediately after All Requests', () => {
    for (const role of ['requester', 'setup_owner', 'admin'] as const) {
      const items = navSectionsForRole(role).flatMap((section) => section.items)
      const allRequestsIndex = items.findIndex((item) => item.to === '/requests')
      expect(items[allRequestsIndex + 1]).toMatchObject({ to: '/my-drafts', label: 'My drafts' })
      expect(items.some((item) => item.to === '/requests/new' && item.label === 'Create Request')).toBe(true)
    }
  })

  it('keeps requester entries for requesters without admin tools', () => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role: 'requester' }))

    expect(html).not.toContain('href="/requests/new"')
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
