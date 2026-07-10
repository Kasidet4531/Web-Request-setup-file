import { Link, useRouterState } from '@tanstack/react-router'

const navItems = [
  { to: '/login', label: 'Login' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/requests', label: 'PSF Requests' },
  { to: '/history', label: 'Global History' },
  { to: '/admin/export-profile', label: 'Export' },
  { to: '/admin', label: 'Admin' },
] as const

export function Navigation() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <nav className="app-nav" aria-label="Primary">
      {navItems.map((item) => {
        const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`)

        return (
          <Link
            key={item.to}
            className={isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link'}
            to={item.to}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
