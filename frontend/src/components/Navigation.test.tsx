import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Navigation } from './Navigation'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: string; to: string }) =>
    createElement('a', { href: to }, children),
  useRouterState: () => '/admin/autofill',
}))

describe('Navigation', () => {
  it('offers direct links to admin management and autofill rules', () => {
    const html = renderToStaticMarkup(createElement(Navigation))

    expect(html).toContain('href="/admin/users"')
    expect(html).toContain('Admin management')
    expect(html).toContain('href="/admin/autofill"')
    expect(html).toContain('Autofill rules')
  })
})
