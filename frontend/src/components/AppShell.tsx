import { useEffect, useState } from 'react'
import { Link, Outlet } from '@tanstack/react-router'
import { Navigation } from './Navigation'
import { subscribeAuthSessionChanged } from '../services/auth-session'
import {
  ApiError,
  fetchCurrentUser,
  fetchHealthStatus,
  logout,
  type AuthenticatedUserProfile,
  type HealthCheckResponse,
} from '../services/api'

type HealthState =
  | { status: 'loading' }
  | { status: 'success'; data: HealthCheckResponse }
  | { status: 'error'; error: string }

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthenticatedUserProfile }
  | { status: 'anonymous' }
  | { status: 'error'; error: string }

function AuthStatusCard() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' })

  const loadCurrentUser = async () => {
    setAuthState({ status: 'loading' })

    try {
      const data = await fetchCurrentUser()
      setAuthState({ status: 'authenticated', user: data.user })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthState({ status: 'anonymous' })
        return
      }

      const message = error instanceof ApiError ? error.message : 'Unable to check session'
      setAuthState({ status: 'error', error: message })
    }
  }

  const handleLogout = async () => {
    await logout()
    setAuthState({ status: 'anonymous' })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCurrentUser()
    }, 0)

    const unsubscribe = subscribeAuthSessionChanged((detail) => {
      if (detail.status === 'authenticated') {
        setAuthState({ status: 'authenticated', user: detail.user })
        return
      }

      setAuthState({ status: 'anonymous' })
    })

    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  if (authState.status === 'loading') {
    return <p className="auth-status">Checking session…</p>
  }

  if (authState.status === 'authenticated') {
    return (
      <div className="auth-status auth-status--authenticated">
        <span>
          Signed in as <strong>{authState.user.displayName}</strong> ({authState.user.role})
        </span>
        <button className="secondary-button" onClick={() => void handleLogout()} type="button">
          Logout
        </button>
      </div>
    )
  }

  if (authState.status === 'error') {
    return <p className="auth-status auth-status--error">{authState.error}</p>
  }

  return (
    <Link className="primary-button" to="/login">
      Login
    </Link>
  )
}

function HealthStatusCard() {
  const [healthState, setHealthState] = useState<HealthState>({ status: 'loading' })

  const loadHealth = async (showLoadingState = true) => {
    if (showLoadingState) {
      setHealthState({ status: 'loading' })
    }

    try {
      const data = await fetchHealthStatus()
      setHealthState({ status: 'success', data })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to reach backend'
      setHealthState({ status: 'error', error: message })
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHealth(false)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  return (
    <section className="status-card" aria-live="polite">
      <div className="status-card__header">
        <div>
          <p className="status-card__eyebrow">Backend connectivity</p>
          <h2>API baseline</h2>
        </div>
        <button className="secondary-button" onClick={() => void loadHealth()} type="button">
          Retry
        </button>
      </div>

      {healthState.status === 'loading' ? (
        <p className="status-card__message">Checking GET /api/health…</p>
      ) : null}

      {healthState.status === 'success' ? (
        <div className="status-card__content">
          <span className="status-pill status-pill--success">Connected</span>
          <p className="status-card__message">
            Backend status: <strong>{healthState.data.status}</strong> · Database status:{' '}
            <strong>{healthState.data.database.status}</strong>
          </p>
        </div>
      ) : null}

      {healthState.status === 'error' ? (
        <div className="status-card__content">
          <span className="status-pill status-pill--error">Connection failed</span>
          <p className="status-card__message">{healthState.error}</p>
        </div>
      ) : null}
    </section>
  )
}

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div>
          <p className="app-shell__eyebrow">PSF Setup File Request Management</p>
          <h1>Frontend application shell</h1>
          <p className="app-shell__description">
            Shared layout, route placeholders, and a real API client baseline for the next
            feature slices.
          </p>
        </div>
        <div className="app-shell__actions">
          <AuthStatusCard />
          <Link className="primary-button" to="/dashboard">
            Open dashboard
          </Link>
        </div>
      </header>

      <Navigation />

      <HealthStatusCard />

      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  )
}
