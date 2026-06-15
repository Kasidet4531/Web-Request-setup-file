import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ApiError, loginWithPassword } from '../../services/api'

export const Route = createFileRoute('/login/')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin.demo')
  const [password, setPassword] = useState('AdminDemo123!')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await loginWithPassword(username, password)
      await navigate({ to: '/dashboard' })
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : 'Unable to sign in'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-card login-card">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Local authentication</p>
          <h1>Login</h1>
          <p className="page-card__description">
            Sign in with a seeded MVP testing account. The backend stores the authenticated
            user id in an HTTP-only session cookie; no localStorage is used.
          </p>
        </div>
      </div>

      <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="form-field">
          <span>Username</span>
          <input
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            required
            type="text"
            value={username}
          />
        </label>

        <label className="form-field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="page-card__body login-card__seeded-users">
        <div className="page-card__section">
          <h2>Seeded users for MVP testing</h2>
          <ul>
            <li>requester.demo / RequesterDemo123! — Requester</li>
            <li>setup.gntc.demo / SetupGntcDemo123! — Setup Owner GNTC</li>
            <li>setup.mfg.demo / SetupMfgDemo123! — Setup Owner MFG</li>
            <li>admin.demo / AdminDemo123! — Admin</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
