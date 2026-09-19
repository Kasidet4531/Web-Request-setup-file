import { Link, useRouterState } from '@tanstack/react-router'
import nxpLogo from '../assets/NXP.png'
import { navSectionsForRole, resolveActivePath, type UserRole } from './navigationState'

export function NavSidebar({
  collapsed = false,
  role,
}: {
  collapsed?: boolean
  role: UserRole | null
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const sections = navSectionsForRole(role)
  const activePath = resolveActivePath(pathname, sections)

  return (
    <aside
      aria-hidden={collapsed || undefined}
      aria-label="Primary"
      className={collapsed ? 'app-sidebar app-sidebar--collapsed' : 'app-sidebar'}
      inert={collapsed || undefined}
    >
      <div className="sidebar__brand">
        <img src={nxpLogo} alt="NXP Semiconductors" />
        <div>
          <div className="sidebar__title">PSF Request Portal</div>
          <div className="sidebar__subtitle">Setup File Management</div>
        </div>
      </div>

      <div className="sidebar__body">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="sidebar__section-label">{section.label}</div>
            <nav className="sidebar__nav">
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
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  )
}
