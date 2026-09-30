import type { MouseEventHandler, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { isStandaloneAuthenticationPath } from './navigationState'

const routerStateHarness = vi.hoisted(() => ({ pathname: '/admin/form-config/2' }))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: routerStateHarness.pathname } }),
  Link: ({ children, onClick, search, to }: { children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement>; search?: { formKey?: string }; to: string }) =>
    <a href={search?.formKey ? `${to}?formKey=${search.formKey}` : to} onClick={onClick}>{children}</a>,
  Outlet: () => null,
}))

describe('isStandaloneAuthenticationPath', () => {
  it('keeps the login route out of the authenticated application shell', () => {
    expect(isStandaloneAuthenticationPath('/login')).toBe(true)
    expect(isStandaloneAuthenticationPath('/login/')).toBe(true)
    expect(isStandaloneAuthenticationPath('/requests')).toBe(false)
  })
})

describe('AppShell form version navigation', () => {
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
