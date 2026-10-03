import { Link, useRouterState } from '@tanstack/react-router'
import { Settings, X } from 'lucide-react'
import type { RefObject } from 'react'
import { navSectionsForRole, resolveActivePath, type UserRole } from './navigationState'

export function NavSidebar({
  collapsed = false,
  role,
  mobile = false,
  onClose,
  onNavigate,
  navigationRef,
}: {
  collapsed?: boolean
  role: UserRole | null
  mobile?: boolean
  onClose?: () => void
  onNavigate?: () => void
  navigationRef?: RefObject<HTMLElement | null>
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const sections = navSectionsForRole(role)
  const activePath = resolveActivePath(pathname, sections)
  const visibleSections = mobile ? sections : sections.filter((section) => section.label === 'Work').map((section) => ({ ...section, items: section.items.filter((item) => item.to !== '/requests/new') }))
  const shortLabels: Record<string, string> = { '/requests': 'Requests', '/requests/new': 'Create', '/admin/export-profile': 'Export', '/history': 'History' }

  return (
    <aside
      id="primary-navigation"
      ref={navigationRef}
      aria-hidden={collapsed || undefined}
      aria-label="Primary"
      className={collapsed ? 'app-sidebar app-sidebar--collapsed' : 'app-sidebar'}
      inert={collapsed || undefined}
      role={mobile && !collapsed ? 'dialog' : undefined}
      aria-modal={mobile && !collapsed ? true : undefined}
    >
      <div className="sidebar__brand">
        <div>
          <div className="sidebar__title"><span>PSF</span><span>Request Portal</span></div>
          <div className="sidebar__subtitle">Setup File Management</div>
        </div>
        <button className="icon-button sidebar__close" aria-label="Close navigation" type="button" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="sidebar__body">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <div className="sidebar__section-label">{section.label}</div>
            <nav className="sidebar__nav" aria-label={section.label}>
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = item.to === activePath

                return (
                  <Link
                    key={item.to}
                    className={
                      isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
                    }
                    to={item.to}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={onNavigate}
                  >
                    <Icon size={16} />
                    <span>{mobile ? item.label : shortLabels[item.to] ?? item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        ))}
        {!mobile && role === 'admin' ? <nav className="sidebar__nav sidebar__admin" aria-label="Administration">
          <Link to="/admin" aria-label="Administration" onClick={onNavigate} className={`sidebar__link${pathname.startsWith('/admin') && pathname !== '/admin/export-profile' ? ' sidebar__link--active' : ''}`} aria-current={pathname === '/admin' ? 'page' : undefined}><Settings size={18} /><span>Admin</span></Link>
        </nav> : null}
      </div>
      <div className="sidebar__footer">Engineering operations</div>
    </aside>
  )
}
