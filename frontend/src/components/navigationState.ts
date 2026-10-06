import type { RequestBreadcrumb } from './requestBreadcrumb'
import {
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  Sliders,
  Users,
  Wand2,
  Settings,
  FileText as DraftFileText,
} from 'lucide-react'

export type UserRole = 'requester' | 'setup_owner' | 'admin'

export type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

export type NavSection = {
  label: string
  items: NavItem[]
}

/**
 * Visibility follows the approved authenticated-role destinations.
 * Hiding a link is presentation only; the backend remains the enforcement point.
 */
export function navSectionsForRole(role: UserRole | null): NavSection[] {
  const canCreateRequest = role !== null
  const canExport = role === 'requester' || role === 'admin'
  const isAdmin = role === 'admin'

  const sections: NavSection[] = [
    {
      label: 'Work',
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/requests', label: 'Requests', icon: FileText },
        ...(role ? [{ to: '/my-drafts', label: 'My Drafts', icon: DraftFileText }] : []),
        ...(canCreateRequest
          ? [{ to: '/requests/new', label: 'Create Request', icon: PlusCircle }]
          : []),
        ...(canExport
          ? [{ to: '/admin/export-profile', label: 'Export to Excel', icon: FileSpreadsheet }]
          : []),
        ...(role ? [{ to: '/history', label: 'Audit History', icon: History }] : []),
      ],
    },
  ]

  if (isAdmin) {
    sections.push({
      label: 'Administration',
      items: [
        { to: '/admin', label: 'Administration', icon: Settings },
        { to: '/admin/users', label: 'Users & Roles', icon: Users },
        { to: '/admin/form-config', label: 'Form Management', icon: Sliders },
        { to: '/admin/workflow', label: 'Status Management', icon: ListChecks },
        { to: '/admin/autofill', label: 'Auto-fill Rules', icon: Wand2 },
      ],
    })
  }

  return sections
}

export function isStandaloneAuthenticationPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/login/'
}

export function resolveActivePath(pathname: string, sections: NavSection[], request: RequestBreadcrumb | null = null): string | null {
  const normalised =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  const items = sections.flatMap((section) => section.items)
  const segments = normalised.split('/').filter(Boolean)
  if (request?.isDraft && segments[0] === 'requests' && segments[1] === request.requestId && items.some((item) => item.to === '/my-drafts')) return '/my-drafts'

  const exact = items.find((item) => item.to === normalised)
  if (exact) {
    return exact.to
  }

  return (
    items
      .filter((item) => normalised.startsWith(`${item.to}/`))
      .sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null
  )
}

/** Authorized contextual tools sit beside the working surface, outside the work rail. */
export function contextualAdminSections(role: UserRole | null): NavSection[] {
  if (role !== 'admin') return []
  const sections = navSectionsForRole(role)
  const adminItems = (sections.find((section) => section.label === 'Administration')?.items ?? []).filter((item) => item.to !== '/admin')
  const workItems = sections.find((section) => section.label === 'Work')?.items ?? []
  return [
    { label: 'Request configuration', items: adminItems.filter((item) => item.to !== '/admin/users') },
    { label: 'Access', items: adminItems.filter((item) => item.to === '/admin/users') },
    { label: 'Reporting', items: workItems.filter((item) => item.to === '/history' || item.to === '/admin/export-profile') },
  ]
}
