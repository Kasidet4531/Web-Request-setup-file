import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from './ui/PageHeader'
import { AsyncNotice } from './ui/AsyncNotice'
import { navSectionsForRole, type UserRole } from './navigationState'
import { fetchCurrentUser } from '../services/api'

const TOOL_DESCRIPTIONS: Record<string, string> = {
  '/admin/drafts': 'Inspect private Drafts, reminders and permanent deletions.',
  '/admin/users': 'Manage user roles and setup-owner departments.',
  '/admin/form-config': 'Review form versions and edit or publish draft definitions.',
  '/admin/workflow': 'Configure request statuses and PSF information visibility.',
  '/admin/autofill': 'Configure field suggestions from completed requests.',
}

const TOOL_PATHS = ['/admin/drafts', '/admin/form-config', '/admin/workflow', '/admin/autofill', '/admin/users']

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
    <PageHeader title="Administration" />
    {loading ? <AsyncNotice kind="loading" title="Loading available tools…" /> : error ? <AsyncNotice kind="error" title={error} action={<button type="button" className="btn-secondary" onClick={() => { setLoading(true); setError(null); setRetry((value) => value + 1) }}>Retry</button>} /> : <AdministrationTools role={role} />}
  </article>
}

export function AdministrationTools({ role }: { role: UserRole | null }) {
  const navigation = navSectionsForRole(role).flatMap((section) => section.items)
  const items = TOOL_PATHS.flatMap((path) => navigation.filter((item) => item.to === path))
  return <>
    {role !== 'admin' ? <AsyncNotice kind="info" title="Administration settings require administrator access." /> : null}
    <ul className="tool-directory administration-directory__tools">{items.map(({ to, label, icon: Icon }) => (
      <li key={to}>
        <Link to={to}>
          <Icon aria-hidden="true" className="tool-directory__icon" size={20} />
          <span className="tool-directory__content">
            <strong>{label}</strong>
            <small>{TOOL_DESCRIPTIONS[to]}</small>
          </span>
          <ChevronRight aria-hidden="true" className="tool-directory__chevron" size={16} />
        </Link>
      </li>
    ))}</ul>
    {items.length === 0 ? <Link className="btn-secondary" to="/dashboard">Back to Dashboard</Link> : null}
  </>
}
