import type { MouseEventHandler, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { isStandaloneAuthenticationPath } from './navigationState'

const routerStateHarness = vi.hoisted(() => ({ pathname: '/admin/form-config/2', status: 'loading' as 'loading' | 'anonymous' | 'error', role: null as 'requester' | 'setup_owner' | 'admin' | null }))

vi.mock('react', async (load) => {
  const actual = await load<typeof import('react')>()
  return { ...actual, useState: (initial: unknown) => actual.useState(
    routerStateHarness.role && initial && typeof initial === 'object' && 'status' in initial && initial.status === 'loading'
      ? { status: 'authenticated', user: { role: routerStateHarness.role, displayName: 'Tester', username: 'tester' } }
      : initial && typeof initial === 'object' && 'status' in initial && initial.status === 'loading'
        ? { status: routerStateHarness.status, error: 'Server unavailable' } : initial,
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
