import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AdministrationTools } from './AdministrationDirectory'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
}))

describe('AdministrationTools', () => {
  it('links each of the seven authorized administration and reporting tools once', () => {
    const html = renderToStaticMarkup(<AdministrationTools role="admin" />)
    expect(html).toContain('Audit History')
    for (const path of ['/admin/drafts', '/admin/form-config', '/admin/workflow', '/admin/autofill', '/admin/users', '/admin/export-profile', '/history']) {
      expect(html.match(new RegExp(`href="${path}"`, 'g'))).toHaveLength(1)
    }
  })

  it('keeps only authorized reporting visible to requesters', () => {
    const html = renderToStaticMarkup(<AdministrationTools role="requester" />)
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
