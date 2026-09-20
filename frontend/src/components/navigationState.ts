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
 * Visibility mirrors the current server permission matrix (ADR 0014 / T01).
 * Hiding a link is presentation only; the backend remains the enforcement point.
 */
export function navSectionsForRole(role: UserRole | null): NavSection[] {
  const canCreateRequest = role === 'requester' || role === 'admin'
  const canExport = role === 'requester' || role === 'admin'
  const isAdmin = role === 'admin'

  const sections: NavSection[] = [
    {
      label: 'Overview',
      items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      label: 'Requests & Workflow',
      items: [
        { to: '/requests', label: 'All PSF Requests', icon: FileText },
        ...(canCreateRequest
          ? [{ to: '/requests/new', label: 'Create Request', icon: PlusCircle }]
          : []),
        ...(canExport
          ? [{ to: '/admin/export-profile', label: 'Export to Excel', icon: FileSpreadsheet }]
          : []),
        ...(isAdmin ? [{ to: '/history', label: 'Audit History', icon: History }] : []),
      ],
    },
  ]

  if (isAdmin) {
    sections.push({
      label: 'Administration',
      items: [
        { to: '/admin/users', label: 'Users & Roles', icon: Users },
        { to: '/admin/form-config', label: 'Form Schema Config', icon: Sliders },
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

export function resolveActivePath(pathname: string, sections: NavSection[]): string | null {
  const normalised =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  const items = sections.flatMap((section) => section.items)

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
