import type { RequestBreadcrumb } from './requestBreadcrumb'
import { Link, useRouterState } from '@tanstack/react-router'
import { X } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { navSectionsForRole, resolveActivePath, type UserRole } from './navigationState'

export function NavSidebar({
  collapsed = false,
  role,
  request = null,
  mobile = false,
  onClose,
  onNavigate,
  navigationRef,
  footer,
}: {
  collapsed?: boolean
  role: UserRole | null
  request?: RequestBreadcrumb | null
  mobile?: boolean
  onClose?: () => void
  onNavigate?: () => void
  navigationRef?: RefObject<HTMLElement | null>
  footer?: ReactNode
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const sections = navSectionsForRole(role)
  const activePath = resolveActivePath(pathname, sections, request)
  const hiddenDrawer = mobile && collapsed

  return (
    <aside
      id="primary-navigation"
      ref={navigationRef}
      aria-hidden={hiddenDrawer || undefined}
      aria-label="Primary"
      className={`app-sidebar${collapsed ? ' app-sidebar--collapsed' : ''}${mobile ? ' app-sidebar--mobile' : ''}`}
      inert={hiddenDrawer || undefined}
      role={mobile && !collapsed ? 'dialog' : undefined}
      aria-modal={mobile && !collapsed ? true : undefined}
    >
      <div className="sidebar__brand">
        <div>
          <div className="sidebar__title"><span>PSF</span><span>Request Portal</span></div>
          <div className="sidebar__subtitle">Setup File Management</div>
        </div>
        {mobile ? <button className="icon-button sidebar__close" aria-label="Close navigation" type="button" onClick={onClose}><X size={18} /></button> : null}
      </div>

      <div className="sidebar__body">
        {sections.map((section) => (
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
                    title={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={onNavigate}
                  >
                    <Icon size={16} />
                    <span className="sidebar__link-label">{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        ))}
      </div>
      {footer ? <div className="sidebar__footer">{footer}</div> : null}
    </aside>
  )
}
