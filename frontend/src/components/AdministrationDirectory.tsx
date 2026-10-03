import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from './ui/PageHeader'
import { AsyncNotice } from './ui/AsyncNotice'
import { navSectionsForRole, type UserRole } from './navigationState'
import { fetchCurrentUser } from '../services/api'

const TOOL_DESCRIPTIONS: Record<string, string> = {
  '/admin/users': 'Manage user roles and setup-owner departments.',
  '/admin/form-config': 'Review form versions and edit or publish draft definitions.',
  '/admin/workflow': 'Configure request statuses and PSF information visibility.',
  '/admin/autofill': 'Configure field suggestions from completed requests.',
  '/admin/export-profile': 'Filter requests, review the preview, and export to Excel.',
}

const TOOL_GROUPS = [
  { key: 'configuration', title: 'Request configuration', description: 'Shape the forms and rules used by requests.', paths: ['/admin/form-config', '/admin/workflow', '/admin/autofill'] },
  { key: 'access', title: 'Access', description: 'Manage the people working in this portal.', paths: ['/admin/users'] },
  { key: 'reporting', title: 'Reporting', description: 'Review request data and prepare Excel exports.', paths: ['/admin/export-profile'] },
]

export function AdministrationDirectory() {
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    void fetchCurrentUser().then(({ user }) => { if (active) { setRole(user.role); setLoading(false) } }).catch((error: unknown) => { if (active) { setError(error instanceof Error ? error.message : 'Unable to load access'); setLoading(false) } })
    return () => { active = false }
  }, [retry])
  return <article className="workflow-page">
    <PageHeader title="Administration" description="Manage access, form definitions, and request workflow settings." />
    {loading ? <AsyncNotice kind="loading" title="Loading available tools…" /> : error ? <AsyncNotice kind="error" title={error} action={<button type="button" className="btn-secondary" onClick={() => { setLoading(true); setError(null); setRetry((value) => value + 1) }}>Retry</button>} /> : <AdministrationTools role={role} />}
  </article>
}

export function AdministrationTools({ role }: { role: UserRole | null }) {
  const items = navSectionsForRole(role).flatMap((section) => section.items).filter((item) => item.to.startsWith('/admin/'))
  return <>
      {role !== 'admin' ? <AsyncNotice kind="info" title="Administration settings require administrator access." /> : null}
      <div className="administration-directory__groups">{TOOL_GROUPS.map((group) => {
        const groupItems = group.paths.flatMap((path) => items.filter((item) => item.to === path))
        if (groupItems.length === 0) return null
        return <section aria-labelledby={`administration-${group.key}`} className={`administration-directory__group administration-directory__group--${group.key}`} key={group.key}>
          <header className="administration-directory__group-heading"><h2 id={`administration-${group.key}`}>{group.title}</h2><p>{group.description}</p></header>
          <ul className="tool-directory">{groupItems.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <Link to={to}>
            <Icon aria-hidden="true" className="tool-directory__icon" size={20} />
            <span className="tool-directory__content">
              <strong>{label}</strong>
              {TOOL_DESCRIPTIONS[to] ? <small>{TOOL_DESCRIPTIONS[to]}</small> : null}
            </span>
            <ChevronRight aria-hidden="true" className="tool-directory__chevron" size={16} />
          </Link>
        </li>
          ))}</ul>
        </section>
      })}</div>
      {items.length === 0 ? <Link className="btn-secondary" to="/dashboard">Back to Dashboard</Link> : null}
    </>
}
