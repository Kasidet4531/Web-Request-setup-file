import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Layers, LogOut, Menu, Moon, Plus, Shield, Sun, UserCheck, X } from 'lucide-react'
import { RequestBreadcrumbContext, requestDocumentTitle, type RequestBreadcrumb } from './requestBreadcrumb'
import { NavSidebar } from './NavSidebar'
import { FormVersionBreadcrumbContext, type FormVersionBreadcrumb } from './formVersionBreadcrumb'
import { contextualAdminSections, isStandaloneAuthenticationPath, resolveActivePath, type UserRole } from './navigationState'
import { subscribeAuthSessionChanged } from '../services/auth-session'
import { AsyncNotice } from './ui/AsyncNotice'
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
function breadcrumbsForPath(pathname: string, formVersion: FormVersionBreadcrumb | null, request: RequestBreadcrumb | null = null): Crumb[] {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0 || segments[0] === 'dashboard') {
    return [{ label: 'Dashboard' }]
  }

  if (segments[0] === 'login') {
    return [{ label: 'Sign in' }]
  }

  if (segments[0] === 'requests') {
    if (!segments[1]) return [{ label: 'All PSF Requests' }]
    const crumbs: Crumb[] = [{ label: 'PSF Requests', to: '/requests' }]
    if (segments[1] === 'new') crumbs.push({ label: 'Create New Request' })
    else {
      crumbs.push({ label: request?.requestId === segments[1] ? request.requestNo : 'Request detail' })
      if (segments[2] === 'history') crumbs.push({ label: 'Audit History' })
    }
    return crumbs
  }

  if (segments[0] === 'history') return [{ label: 'Global Audit History' }]
  if (segments[0] === 'my-drafts') return [{ label: 'My drafts' }]

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
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setIsOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('pointerdown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('pointerdown', handleClick); document.removeEventListener('keydown', handleKey) }
  }, [isOpen])

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        ref={triggerRef}
        aria-label={`Account: ${user.displayName}`}
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
  const location = useRouterState({ select: (state) => state.location })
  const pathname = location.pathname
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' })
  const [sessionCheckAttempt, setSessionCheckAttempt] = useState(0)
  const [formVersionBreadcrumb, setFormVersionBreadcrumb] = useState<FormVersionBreadcrumb | null>(null)
  const [requestBreadcrumb, setRequestBreadcrumb] = useState<RequestBreadcrumb | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 899px)').matches,
  )
  const [mobileNavigation, setMobileNavigation] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches)
  const navigationRef = useRef<HTMLElement>(null)
  const navigationTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileDrawerOpen = mobileNavigation && sidebarOpen
  const [darkMode, setDarkMode] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)')
    const handleChange = () => { setMobileNavigation(media.matches); setSidebarOpen(!media.matches) }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    document.title = requestDocumentTitle(pathname, requestBreadcrumb, breadcrumbsForPath(pathname, formVersionBreadcrumb, requestBreadcrumb).at(-1)?.label ?? 'PSF Requests')
  }, [pathname, formVersionBreadcrumb, requestBreadcrumb])

  useEffect(() => {
    if (!mobileDrawerOpen) return
    const navigation = navigationRef.current
    const trigger = navigationTriggerRef.current
    navigation?.querySelector<HTMLButtonElement>('.sidebar__close')?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSidebarOpen(false) }
      if (event.key === 'Tab') {
        const controls = navigation?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
        const first = controls?.[0]
        const last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); trigger?.focus() }
  }, [mobileDrawerOpen])

  useEffect(() => {
    let isMounted = true
    let sessionChanged = false

    const loadCurrentUser = async () => {
      try {
        const data = await fetchCurrentUser()
        if (isMounted && !sessionChanged) {
          setAuthState({ status: 'authenticated', user: data.user })
        }
      } catch (error) {
        if (!isMounted || sessionChanged) {
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
      sessionChanged = true
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
  }, [sessionCheckAttempt])

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
  const breadcrumbs = breadcrumbsForPath(pathname, formVersionBreadcrumb, requestBreadcrumb)
  const canCreateRequest = authState.status === 'authenticated'
  const isFormVersion = pathname.startsWith('/admin/form-config/')

  if (isStandaloneAuthenticationPath(pathname)) {
    return (
      <main className="auth-layout">
        <Outlet />
      </main>
    )
  }

  if (authState.status === 'anonymous') {
    return <Navigate to="/login" search={{ redirect: location.href }} replace />
  }

  if (authState.status !== 'authenticated') {
    return (
      <main className="auth-layout">
        <section className="page-card">
          {authState.status === 'loading' ? <AsyncNotice kind="loading" title="Checking session…" /> : (
            <>
              <p role="alert">{authState.error}</p>
              <button className="btn-primary" type="button" onClick={() => {
                setAuthState({ status: 'loading' })
                setSessionCheckAttempt((attempt) => attempt + 1)
              }}>Try again</button>
            </>
          )}
        </section>
      </main>
    )
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <NavSidebar collapsed={!sidebarOpen} role={role} mobile={mobileNavigation} navigationRef={navigationRef}
        onClose={() => setSidebarOpen(false)} onNavigate={() => { if (mobileNavigation) setSidebarOpen(false) }} />
      {mobileDrawerOpen ? <button className="navigation-backdrop" tabIndex={-1} aria-label="Close navigation backdrop" type="button" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="app-layout__body" inert={mobileDrawerOpen || undefined}>
        <header className={isFormVersion ? 'app-header app-header--form-version' : 'app-header'}>
          <div className="header-left">
            <button
              ref={navigationTriggerRef}
              aria-controls="primary-navigation"
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
              <Link className={pathname.startsWith('/admin') ? 'btn-secondary header-new-request' : 'btn-primary header-new-request'} aria-label="New Request" to="/requests/new">
                <Plus size={14} /><span>New Request</span>
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
          </div>
        </header>

        <main className="app-main" id="main-content" tabIndex={-1}>
          <div className="app-main__inner">
            {role === 'admin' && pathname.startsWith('/admin') ? <nav aria-label="Administration tools" className="context-navigation">
              <Link className={pathname === '/admin' ? 'context-navigation__home is-active' : 'context-navigation__home'} to="/admin" aria-current={pathname === '/admin' ? 'page' : undefined}>Administration</Link>
              {contextualAdminSections(role).map((section) => <div className="context-navigation__group" key={section.label}>
                <span>{section.label}</span>
                <div>{section.items.map((item) => <Link key={item.to} to={item.to} aria-current={resolveActivePath(pathname, contextualAdminSections(role)) === item.to ? 'page' : undefined}>{item.label}</Link>)}</div>
              </div>)}
            </nav> : null}
            <FormVersionBreadcrumbContext.Provider value={setFormVersionBreadcrumb}>
              <RequestBreadcrumbContext.Provider value={setRequestBreadcrumb}><Outlet /></RequestBreadcrumbContext.Provider>
            </FormVersionBreadcrumbContext.Provider>
          </div>
        </main>
      </div>
    </div>
  )
}
