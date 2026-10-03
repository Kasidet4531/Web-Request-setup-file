import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AdministrationTools } from './AdministrationDirectory'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
}))

describe('AdministrationTools', () => {
  it('groups every authorized administrator destination into its working category', () => {
    const html = renderToStaticMarkup(<AdministrationTools role="admin" />)
    expect(html).toContain('Request configuration')
    expect(html).toContain('Access')
    expect(html).toContain('Reporting')
    for (const path of ['/admin/form-config', '/admin/workflow', '/admin/autofill', '/admin/users', '/admin/export-profile']) {
      expect(html.match(new RegExp(`href="${path}"`, 'g'))).toHaveLength(1)
    }
    expect(html.indexOf('href="/admin/form-config"')).toBeLessThan(html.indexOf('id="administration-access"'))
    expect(html.indexOf('href="/admin/users"')).toBeLessThan(html.indexOf('id="administration-reporting"'))
  })

  it('keeps only authorized reporting visible to requesters', () => {
    const html = renderToStaticMarkup(<AdministrationTools role="requester" />)
    expect(html).toContain('Reporting')
    expect(html).toContain('href="/admin/export-profile"')
    expect(html).not.toContain('href="/admin/form-config"')
    expect(html).not.toContain('href="/admin/users"')
    expect(html).not.toContain('id="administration-access"')
  })

  it.each(['setup_owner', null] as const)('provides a dashboard return when %s has no authorized tools', (role) => {
    const html = renderToStaticMarkup(<AdministrationTools role={role} />)
    expect(html).toContain('href="/dashboard"')
    expect(html).not.toContain('href="/admin/')
    expect(html).not.toContain('administration-directory__group--')
  })
})
