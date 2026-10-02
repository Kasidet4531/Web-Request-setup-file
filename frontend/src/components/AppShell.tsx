import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Layers, LogOut, Menu, Moon, Plus, Shield, Sun, UserCheck, X } from 'lucide-react'
import { NavSidebar } from './NavSidebar'
import { FormVersionBreadcrumbContext, type FormVersionBreadcrumb } from './formVersionBreadcrumb'
import { isStandaloneAuthenticationPath, type UserRole } from './navigationState'
import { subscribeAuthSessionChanged } from '../services/auth-session'
import {
  ApiError,
  fetchCurrentUser,
  logout,
  type AuthenticatedUserProfile,
} from '../services/api'

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthenticatedUserProfile }
  | { status: 'anonymous' }
  | { status: 'error'; error: string }

type Crumb = { label: string; to?: string; search?: { formKey: FormVersionBreadcrumb['formKey'] } }

/**
 * Request crumbs use route paths only; form versions use the version already
 * loaded by the editor so their status is not guessed from the URL.
 */
function breadcrumbsForPath(pathname: string, formVersion: FormVersionBreadcrumb | null): Crumb[] {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0 || segments[0] === 'dashboard') {
    return [{ label: 'Dashboard' }]
  }

  if (segments[0] === 'login') {
    return [{ label: 'Sign in' }]
  }

  if (segments[0] === 'requests') {
    if (!segments[1]) return []
    const crumbs: Crumb[] = [{ label: 'PSF Requests', to: '/requests' }]
    if (segments[1] === 'new') crumbs.push({ label: 'Create New Request' })
    else {
      crumbs.push({ label: 'Request detail' })
      if (segments[2] === 'history') crumbs.push({ label: 'Audit History' })
    }
    return crumbs
  }

  if (segments[0] === 'history') return [{ label: 'Global Audit History' }]

  if (segments[0] === 'admin') {
    const crumbs: Crumb[] = [{ label: 'Admin Console' }]
    const labels: Record<string, string> = {
      users: 'Users & Roles',
      'form-config': 'Form Management',
      workflow: 'Status Management',
      autofill: 'Auto-fill Rules',
      'export-profile': 'Export to Excel',
      'master-data': 'Master Data',
    }

    if (segments[1] === 'form-config' && segments[2]) {
      const explicitFormKey = segments.length > 3 ? segments[2] : null
      const formKey = explicitFormKey === 'psf-created-information' ? explicitFormKey : formVersion?.formKey ?? 'psf-request'
      const version = explicitFormKey ? segments[3] : segments[2]
      crumbs.push({
        label: labels['form-config'],
        to: '/admin/form-config',
        ...(formKey === 'psf-request' ? {} : { search: { formKey } }),
      })
      const status = formVersion && formVersion.formKey === formKey && String(formVersion.version) === version
        ? formVersion.status === 'published' ? 'Inactive' : formVersion.status === 'active' ? 'Active' : 'Draft'
        : null
      crumbs.push({ label: `v${version}${status ? ` (${status})` : ''}` })
    } else if (segments[1] && labels[segments[1]]) {
      crumbs.push({ label: labels[segments[1]] })
    }

    return crumbs
  }

  return [{ label: 'Dashboard' }]
}

function roleLabel(user: AuthenticatedUserProfile): string {
  if (user.role === 'admin') {
    return 'Admin'
  }

  if (user.role === 'setup_owner') {
    return user.setupOwnerDepartment ? `Setup · ${user.setupOwnerDepartment}` : 'Setup Owner'
  }

  return 'Requester'
}

function RoleIcon({ role }: { role: UserRole }) {
  if (role === 'admin') {
    return <Shield size={11} />
  }

  if (role === 'setup_owner') {
    return <Layers size={11} />
  }

  return <UserCheck size={11} />
}

function UserMenu({ user, onLoggedOut }: { user: AuthenticatedUserProfile; onLoggedOut: () => void }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="user-menu">
      <button
        aria-expanded={isOpen}
        className="user-menu__trigger"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className="user-menu__avatar">{user.displayName.charAt(0).toUpperCase()}</span>
        <span className="user-menu__identity">
          <span className="user-menu__name">{user.displayName}</span>
          <span className="user-menu__role">
            <RoleIcon role={user.role} />
            {roleLabel(user)}
          </span>
        </span>
      </button>

      {isOpen ? (
        <div className="user-menu__panel glass-panel">
          <div className="user-menu__meta">
            <strong>{user.displayName}</strong>
            <span>{user.username}</span>
            <span>{roleLabel(user)}</span>
          </div>
          <button
            className="user-menu__logout"
            onClick={() => {
              setIsOpen(false)
              onLoggedOut()
            }}
            type="button"
          >
            <LogOut size={13} /> Log out
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' })
  const [formVersionBreadcrumb, setFormVersionBreadcrumb] = useState<FormVersionBreadcrumb | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 900px)').matches,
  )
  const [darkMode, setDarkMode] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    let isMounted = true

    const loadCurrentUser = async () => {
      try {
        const data = await fetchCurrentUser()
        if (isMounted) {
          setAuthState({ status: 'authenticated', user: data.user })
        }
      } catch (error) {
        if (!isMounted) {
          return
        }

        if (error instanceof ApiError && error.status === 401) {
          setAuthState({ status: 'anonymous' })
          return
        }

        const message = error instanceof ApiError ? error.message : 'Unable to check session'
        setAuthState({ status: 'error', error: message })
      }
    }

    void loadCurrentUser()

    const unsubscribe = subscribeAuthSessionChanged((detail) => {
      if (detail.status === 'authenticated') {
        setAuthState({ status: 'authenticated', user: detail.user })
        return
      }

      setAuthState({ status: 'anonymous' })
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await logout()
    setAuthState({ status: 'anonymous' })
    await navigate({ to: '/login' })
  }

  const toggleDarkMode = () => {
    setDarkMode((current) => {
      const next = !current
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }

  const role = authState.status === 'authenticated' ? authState.user.role : null
  const breadcrumbs = breadcrumbsForPath(pathname, formVersionBreadcrumb)
  const canCreateRequest = authState.status === 'authenticated'
  const isFormVersion = pathname.startsWith('/admin/form-config/')

  if (isStandaloneAuthenticationPath(pathname)) {
    return (
      <main className="auth-layout">
        <Outlet />
      </main>
    )
  }

  return (
    <div className="app-layout">
      <NavSidebar collapsed={!sidebarOpen} role={role} />

      <div className="app-layout__body">
        <header className={isFormVersion ? 'app-header app-header--form-version' : 'app-header'}>
          <div className="header-left">
            <button
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
              className="icon-button"
              onClick={() => setSidebarOpen((open) => !open)}
              type="button"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <nav aria-label="Breadcrumbs" className="breadcrumbs">
              {breadcrumbs.map((crumb, index) => (
                <span className="breadcrumbs" key={`${crumb.label}-${index}`}>
                  {index > 0 ? <ChevronRight className="breadcrumbs__sep" size={13} /> : null}
                  {crumb.to ? (
                    <Link className="breadcrumbs__link" search={crumb.search} to={crumb.to}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="breadcrumbs__current">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          </div>

          <div className="header-actions">
            {canCreateRequest && pathname !== '/requests/new' ? (
              <Link className={pathname.startsWith('/admin') ? 'btn-secondary' : 'btn-primary'} to="/requests/new">
                <Plus size={14} /> New Request
              </Link>
            ) : null}

            <button
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="icon-button"
              onClick={toggleDarkMode}
              type="button"
            >
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {authState.status === 'authenticated' ? (
              <UserMenu onLoggedOut={() => void handleLogout()} user={authState.user} />
            ) : null}

            {authState.status === 'loading' ? (
              <span className="auth-status">Checking session…</span>
            ) : null}

            {authState.status === 'anonymous' ? (
              <Link className="btn-primary" to="/login">
                Login
              </Link>
            ) : null}

            {authState.status === 'error' ? (
              <span className="auth-status auth-status--error">{authState.error}</span>
            ) : null}
          </div>
        </header>

        <main className="app-main">
          <div className="app-main__inner">
            <FormVersionBreadcrumbContext.Provider value={setFormVersionBreadcrumb}>
              <Outlet />
            </FormVersionBreadcrumbContext.Provider>
          </div>
        </main>
      </div>
    </div>
  )
}
