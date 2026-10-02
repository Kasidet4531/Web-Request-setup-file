import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api, ApiError, type AuthResponse } from '../../services/api'
import { notifyAuthSessionChanged } from '../../services/auth-session'
import './-development-login.css'

const accounts = [
  { identity: 'requester', label: 'Requester' },
  { identity: 'setup_owner_gntc', label: 'Setup File Owner — GNTC' },
  { identity: 'setup_owner_mfg', label: 'Setup File Owner — MFG' },
  { identity: 'admin', label: 'Admin' },
] as const

export function DevelopmentLogin({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function login(identity: string) {
    setPending(true)
    setError(null)
    try {
      const response = await api.post<AuthResponse>('/dev/login', { identity })
      notifyAuthSessionChanged({ status: 'authenticated', user: response.user })
      await navigate({ href: redirectTo, replace: true })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to sign in with a local test account')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="development-login" aria-label="Local test accounts">
      <h2>Local test accounts</h2>
      <p>Choose a role to test without company LDAP.</p>
      <div className="development-login__actions">
        {accounts.map(({ identity, label }) => (
          <button className="btn-secondary" type="button" key={identity} disabled={pending} onClick={() => void login(identity)}>
            {label}
          </button>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
