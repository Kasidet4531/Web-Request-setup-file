import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NavSidebar } from './NavSidebar'
import { contextualAdminSections, navSectionsForRole, resolveActivePath } from './navigationState'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children?: unknown; to?: string }) =>
    createElement('a', { href: to, ...props }, children as never),
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
    for (const route of ['/admin/users', '/admin/form-config', '/admin/workflow', '/admin/autofill']) expect(html).not.toContain(`href="${route}"`)
    expect(html).toContain('href="/history"')
    expect(html.includes('href="/admin/export-profile"')).toBe(role === 'requester')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Close navigation"')
  })

  it('offers direct desktop destinations for every authorized admin tool', () => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role: 'admin' }))
    for (const route of ['/dashboard', '/requests', '/my-drafts', '/history', '/admin/export-profile', '/admin']) expect(html).toContain(`href="${route}"`)
    for (const route of ['/admin/users', '/admin/form-config', '/admin/workflow', '/admin/autofill', '/requests/new']) expect(html).toContain(`href="${route}"`)
  })

  it('groups every authorized tool contextually without exposing admin tools to other roles', () => {
    const sections = contextualAdminSections('admin')
    expect(sections.map((section) => section.label)).toEqual(['Request configuration', 'Access', 'Reporting'])
    expect(sections.flatMap((section) => section.items).map((item) => item.to)).toEqual(['/admin/form-config', '/admin/workflow', '/admin/autofill', '/admin/users', '/admin/export-profile', '/history'])
    expect(contextualAdminSections('requester')).toEqual([])
    expect(contextualAdminSections('setup_owner')).toEqual([])
    expect(resolveActivePath('/admin/form-config/2', sections)).toBe('/admin/form-config')
  })

  it('retains accessible active links in the collapsed desktop rail', () => {
    const html = renderToStaticMarkup(
      createElement(NavSidebar, { collapsed: true, role: 'admin' }),
    )

    expect(html).toContain('class="app-sidebar app-sidebar--collapsed"')
    expect(html.match(/<aside[^>]*>/)?.[0]).not.toContain('aria-hidden')
    expect(html.match(/<aside[^>]*>/)?.[0]).not.toContain('inert')
    expect(html).toContain('aria-label="Auto-fill Rules"')
    expect(html).toContain('title="Auto-fill Rules"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('href="/admin"')
  })

  it('offers Create Request and My drafts to every authenticated role immediately after All Requests', () => {
    for (const role of ['requester', 'setup_owner', 'admin'] as const) {
      const items = navSectionsForRole(role).flatMap((section) => section.items)
      const allRequestsIndex = items.findIndex((item) => item.to === '/requests')
      expect(items[allRequestsIndex + 1]).toMatchObject({ to: '/my-drafts', label: 'My Drafts' })
      expect(items.some((item) => item.to === '/requests/new' && item.label === 'Create Request')).toBe(true)
    }
  })

  it('keeps requester entries for requesters without admin tools', () => {
    const html = renderToStaticMarkup(createElement(NavSidebar, { role: 'requester' }))

    expect(html).toContain('href="/requests/new"')
    expect(html).toContain('href="/admin/export-profile"')
    expect(html).not.toContain('href="/admin/users"')
  })

  it('keeps a closed mobile drawer outside keyboard interaction', () => {
    const html = renderToStaticMarkup(<NavSidebar role="requester" collapsed mobile />)
    expect(html.match(/<aside[^>]*>/)?.[0]).toContain('aria-hidden="true"')
    expect(html.match(/<aside[^>]*>/)?.[0]).toContain('inert=""')
  })

  it.each(['requester', 'setup_owner', 'admin'] as const)('shows Audit History and full destination names for %s', (role) => {
    const html = renderToStaticMarkup(<NavSidebar role={role} />)
    expect(html).toContain('href="/history"')
    expect(html).toContain('>Audit History</span>')
    expect(html).toContain('>My Drafts</span>')
    expect(html).toContain('>Requests</span>')
    expect(html.includes('href="/admin/export-profile"')).toBe(role !== 'setup_owner')
  })
})

describe('resolveActivePath', () => {
  const sections = navSectionsForRole('admin')

  it('prefers the exact route over a section prefix', () => {
    expect(resolveActivePath('/requests/new', sections)).toBe('/requests/new')
    expect(resolveActivePath('/requests/', sections)).toBe('/requests')
  })

  it('uses My Drafts ancestry only for the resolved current creator-private Draft', () => {
    const draft = { requestId: 'draft-uuid', requestNo: 'PSF-DRAFT-9', isDraft: true }
    expect(resolveActivePath('/requests/draft-uuid', sections, draft)).toBe('/my-drafts')
    expect(resolveActivePath('/requests/draft-uuid/history', sections, draft)).toBe('/my-drafts')
    expect(resolveActivePath('/requests/other-uuid', sections, draft)).toBe('/requests')
    expect(resolveActivePath('/requests/draft-uuid', sections, { ...draft, isDraft: false })).toBe('/requests')
    expect(resolveActivePath('/requests/new', sections, draft)).toBe('/requests/new')
  })

  it('falls back to the longest matching section prefix', () => {
    expect(resolveActivePath('/requests/0f1e2d3c/history', sections)).toBe('/requests')
    expect(resolveActivePath('/dashboard', sections)).toBe('/dashboard')
    expect(resolveActivePath('/unknown', sections)).toBeNull()
  })
})
