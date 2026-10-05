import type { MouseEventHandler, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { isStandaloneAuthenticationPath } from './navigationState'
import type { RequestBreadcrumb } from './requestBreadcrumb'
import type { FormVersionBreadcrumb } from './formVersionBreadcrumb'

const routerStateHarness = vi.hoisted(() => ({ pathname: '/admin/form-config/2', status: 'loading' as 'loading' | 'anonymous' | 'error', role: null as 'requester' | 'setup_owner' | 'admin' | null, formVersion: null as FormVersionBreadcrumb | null, request: null as RequestBreadcrumb | null, nullStateIndex: 0 }))

beforeEach(() => { routerStateHarness.formVersion = null; routerStateHarness.request = null; routerStateHarness.nullStateIndex = 0 })

afterEach(() => vi.unstubAllGlobals())

vi.mock('react', async (load) => {
  const actual = await load<typeof import('react')>()
  return { ...actual, useState: (initial: unknown) => actual.useState(
    routerStateHarness.role && initial && typeof initial === 'object' && 'status' in initial && initial.status === 'loading'
      ? { status: 'authenticated', user: { role: routerStateHarness.role, displayName: 'Tester', username: 'tester' } }
      : initial && typeof initial === 'object' && 'status' in initial && initial.status === 'loading'
        ? { status: routerStateHarness.status, error: 'Server unavailable' }
        : initial === null ? routerStateHarness.nullStateIndex++ % 2 === 0 ? routerStateHarness.formVersion : routerStateHarness.request : initial,
  ) }
})

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string; href: string } }) => unknown }) =>
    select({ location: { pathname: routerStateHarness.pathname, href: routerStateHarness.pathname } }),
  Link: ({ children, onClick, search, to }: { children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement>; search?: { formKey?: string }; to: string }) =>
    <a href={search?.formKey ? `${to}?formKey=${search.formKey}` : to} onClick={onClick}>{children}</a>,
  Outlet: () => <p>Protected content</p>,
  Navigate: ({ to, search }: { to: string; search: { redirect: string } }) => <a href={`${to}?redirect=${encodeURIComponent(search.redirect)}`}>Redirect</a>,
}))

describe('isStandaloneAuthenticationPath', () => {
  it('keeps the login route out of the authenticated application shell', () => {
    expect(isStandaloneAuthenticationPath('/login')).toBe(true)
    expect(isStandaloneAuthenticationPath('/login/')).toBe(true)
    expect(isStandaloneAuthenticationPath('/requests')).toBe(false)
  })
})

describe('AppShell form version navigation', () => {
  beforeEach(() => { routerStateHarness.role = 'admin' })
  it.each(['requester', 'setup_owner', 'admin'] as const)('offers header New Request for authenticated %s like the sidebar', (role) => {
    routerStateHarness.role = role
    const markup = renderToStaticMarkup(<AppShell />)
    const actions = markup.match(/<div class="header-actions">(.*?)<\/header>/s)?.[1]
    expect(actions).toContain('href="/requests/new"')
    expect(actions).toContain('New Request')
    routerStateHarness.role = null
  })
  it('keeps authorized administration destinations in the global sidebar', () => {
    routerStateHarness.role = 'admin'
    routerStateHarness.pathname = '/admin/form-config/2'
    let markup = renderToStaticMarkup(<AppShell />)
    expect(markup).not.toContain('aria-label="Administration tools"')
    for (const route of ['/admin/form-config', '/admin/workflow', '/admin/autofill', '/admin/users', '/history']) expect(markup).toContain(`href="${route}"`)
    routerStateHarness.pathname = '/dashboard'
    markup = renderToStaticMarkup(<AppShell />)
    expect(markup).toContain('href="/admin/users"')
    routerStateHarness.role = 'requester'
    routerStateHarness.pathname = '/admin/export-profile'
    markup = renderToStaticMarkup(<AppShell />)
    expect(markup).not.toContain('href="/admin/users"')
    routerStateHarness.role = null
  })

  it('places the version breadcrumb in the header', () => {
    routerStateHarness.pathname = '/admin/form-config/2'
    const markup = renderToStaticMarkup(<AppShell />)
    const breadcrumbs = markup.match(/<nav aria-label="Breadcrumbs"[^>]*>(.*?)<\/nav>/)?.[1]
    expect(breadcrumbs).toContain('Form Management</a>')
    expect(breadcrumbs).toContain('v2</span>')
  })

  it('retains the selected PSF form in the Form Management breadcrumb URL', () => {
    routerStateHarness.pathname = '/admin/form-config/psf-created-information/7'
    const markup = renderToStaticMarkup(<AppShell />)
    const breadcrumbs = markup.match(/<nav aria-label="Breadcrumbs"[^>]*>(.*?)<\/nav>/)?.[1]
    expect(breadcrumbs).toContain('href="/admin/form-config?formKey=psf-created-information"')
    routerStateHarness.pathname = '/admin/form-config/2'
  })

  it('offers a keyboard skip target and names the navigation controls', () => {
    routerStateHarness.pathname = '/dashboard'
    const markup = renderToStaticMarkup(<AppShell />)
    expect(markup).toContain('href="#main-content"')
    expect(markup).toContain('id="main-content"')
    expect(markup).toContain('aria-controls="primary-navigation"')
    expect(markup).toContain('aria-label="Collapse navigation"')
    expect(markup.match(/<header[^>]*>(.*?)<\/header>/s)?.[1]).not.toContain('Account: Tester')
    expect(markup.match(/<aside[^>]*>(.*?)<\/aside>/s)?.[1]).toContain('Account: Tester')
  })

  it('identifies My drafts in the breadcrumb instead of Dashboard', () => {
    routerStateHarness.pathname = '/my-drafts'
    const markup = renderToStaticMarkup(<AppShell />)
    const breadcrumbs = markup.match(/<nav aria-label="Breadcrumbs"[^>]*>(.*?)<\/nav>/)?.[1]
    expect(breadcrumbs).toContain('My Drafts')
  })

  it.each([
    ['/requests/new', '/requests', 'Back to Requests'],
    ['/requests/real-uuid/history', '/requests/real-uuid', 'Back to request'],
    ['/admin/users', '/admin', 'Back to Administration'],
    ['/admin/form-config/psf-created-information/7', '/admin/form-config?formKey=psf-created-information', 'Back to Form Management'],
  ])('links %s to its stable parent beside the breadcrumb', (pathname, href, label) => {
    routerStateHarness.pathname = pathname
    const html = renderToStaticMarkup(<AppShell />)
    const header = html.match(/<header[^>]*>(.*?)<\/header>/s)?.[1]
    expect(header).toContain(`href="${href}"`)
    expect(header).toContain(label)
    expect(header).toContain('<ol>')
    expect(header).toContain('aria-current="page"')
  })

  it.each(['/dashboard', '/requests', '/my-drafts', '/history', '/admin/export-profile', '/admin'])('does not invent a Back parent for root %s', (pathname) => {
    routerStateHarness.pathname = pathname
    const header = renderToStaticMarkup(<AppShell />).match(/<header[^>]*>(.*?)<\/header>/s)?.[1]
    expect(header).not.toContain('Back to')
    if (pathname === '/admin/export-profile') expect(header).not.toContain('Administration')
  })

  it('keeps an explicit Requester-family parent when the previous PSF version context is still loaded', () => {
    routerStateHarness.pathname = '/admin/form-config/psf-request/2'
    routerStateHarness.formVersion = { formKey: 'psf-created-information', version: 7, status: 'active', dirty: false }
    const header = renderToStaticMarkup(<AppShell />).match(/<header[^>]*>(.*?)<\/header>/s)?.[1]
    expect(header).toContain('href="/admin/form-config"')
    expect(header).not.toContain('formKey=psf-created-information')
  })

  it('uses private My Drafts ancestry after resolving a Draft and keeps its History parent linked by UUID', () => {
    routerStateHarness.request = { requestId: 'real-uuid', requestNo: 'DRAFT-0042', isDraft: true }
    routerStateHarness.pathname = '/requests/real-uuid'
    let header = renderToStaticMarkup(<AppShell />).match(/<header[^>]*>(.*?)<\/header>/s)?.[1]
    expect(header).toContain('Back to My Drafts')
    expect(header).toContain('DRAFT-0042')
    routerStateHarness.pathname = '/requests/real-uuid/history'
    header = renderToStaticMarkup(<AppShell />).match(/<header[^>]*>(.*?)<\/header>/s)?.[1]
    expect(header).toContain('href="/my-drafts"')
    expect(header).toContain('href="/requests/real-uuid"')
    expect(header).toContain('Back to request')
  })
})

describe('AppShell session gate', () => {
  beforeEach(() => { routerStateHarness.role = null; routerStateHarness.status = 'loading'; routerStateHarness.pathname = '/requests?scope=related#details' })
  it('withholds protected content and navigation while checking the session', () => {
    const html = renderToStaticMarkup(<AppShell />)
    expect(html).toContain('Checking session')
    expect(html).not.toContain('Protected content')
    expect(html).not.toContain('app-layout')
  })
  it('redirects anonymous visitors with their original URL', () => {
    routerStateHarness.status = 'anonymous'
    const html = renderToStaticMarkup(<AppShell />)
    expect(html).toContain('/login?redirect=%2Frequests%3Fscope%3Drelated%23details')
    expect(html).not.toContain('Protected content')
  })
  it('withholds content and offers retry when the session check fails', () => {
    routerStateHarness.status = 'error'
    const html = renderToStaticMarkup(<AppShell />)
    expect(html).toContain('Server unavailable')
    expect(html).toContain('Try again')
    expect(html).not.toContain('Protected content')
    expect(html).not.toContain('Redirect')
  })
  it('allows the login page without a session', () => {
    routerStateHarness.pathname = '/login'
    expect(renderToStaticMarkup(<AppShell />)).toContain('Protected content')
  })
})

describe('browser appearance preferences', () => {
  beforeEach(() => { routerStateHarness.role = 'requester'; routerStateHarness.pathname = '/dashboard' })
  it('restores collapsed navigation and an explicitly selected Dark theme after reload', () => {
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'psf.theme.v1' ? 'dark' : key === 'psf.sidebar-collapsed.v1' ? 'true' : null }, matchMedia: () => ({ matches: false }) })
    const html = renderToStaticMarkup(<AppShell />)
    expect(html.match(/<aside[^>]*>/)?.[0]).toContain('app-sidebar--collapsed')
    expect(html).toContain('aria-label="Expand navigation"')
    expect(html.match(/<aside[^>]*>(.*?)<\/aside>/s)?.[1]).toContain('aria-label="Switch to light mode"')
  })
  it('defaults a first visit to Light even when the host document has a dark class', () => {
    vi.stubGlobal('document', { documentElement: { classList: { contains: () => true } } })
    const html = renderToStaticMarkup(<AppShell />)
    expect(html).toContain('aria-label="Switch to dark mode"')
  })
})
