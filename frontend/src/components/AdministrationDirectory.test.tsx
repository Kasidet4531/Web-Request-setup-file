import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AdministrationTools } from './AdministrationDirectory'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
}))

describe('AdministrationTools', () => {
  it('links each of the five administration tools once and omits entries already under WORK', () => {
    const html = renderToStaticMarkup(<AdministrationTools role="admin" />)
    for (const path of ['/admin/drafts', '/admin/form-config', '/admin/workflow', '/admin/autofill', '/admin/users']) {
      expect(html.match(new RegExp(`href="${path}"`, 'g'))).toHaveLength(1)
    }
    expect(html).not.toContain('href="/admin/export-profile"')
    expect(html).not.toContain('href="/history"')
  })

  it('shows requesters no administration tools and a way back to the dashboard', () => {
    const html = renderToStaticMarkup(<AdministrationTools role="requester" />)
    expect(html).toContain('href="/dashboard"')
    expect(html).not.toContain('href="/admin/export-profile"')
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
