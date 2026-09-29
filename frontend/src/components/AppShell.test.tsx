import type { MouseEventHandler, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { isStandaloneAuthenticationPath } from './navigationState'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: '/admin/form-config/2' } }),
  Link: ({ children, onClick, to }: { children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement>; to: string }) =>
    <a href={to} onClick={onClick}>{children}</a>,
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
    const markup = renderToStaticMarkup(<AppShell />)
    const breadcrumbs = markup.match(/<nav aria-label="Breadcrumbs"[^>]*>(.*?)<\/nav>/)?.[1]
    expect(breadcrumbs).toContain('Form Management</a>')
    expect(breadcrumbs).toContain('v2</span>')
  })
})
