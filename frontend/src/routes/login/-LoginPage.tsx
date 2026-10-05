import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Eye, EyeOff, Lock, Moon, Sun, User } from 'lucide-react'
import { AsyncNotice } from '../../components/ui/AsyncNotice'
import { ApiError, loginWithPassword } from '../../services/api'
import nxpLogo from '../../assets/NXP.png'
import { DevelopmentLogin } from './-DevelopmentLogin'
import { useTheme } from '../../components/theme'

export function LoginPage({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await loginWithPassword(username, password)
      await navigate({ href: redirectTo, replace: true })
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Unable to sign in'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <button className="icon-button login-theme-control" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme} type="button">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="login-page__content">
        <section className="page-card login-card" aria-labelledby="login-title">
        <div className="login-card__brand">
          <img src={nxpLogo} alt="NXP Semiconductors" />
          <div>
            <h1 id="login-title">PSF Request Portal</h1>
            <p>Manage PSF setup files and workflow requests.</p>
          </div>
        </div>

          <form className="login-form" aria-busy={isSubmitting} onSubmit={(event) => void handleSubmit(event)}>
          <div>
            <h2>Company sign-in</h2>
            <p className="login-form__hint">Use your company LDAP username and password.</p>
          </div>
          <label className="form-field" htmlFor="login-username">
            <span>Username</span>
            <span className="login-form__control">
              <User size={16} aria-hidden="true" />
              <input
                autoComplete="username"
                className="input-base input-with-icon"
                disabled={isSubmitting}
                id="login-username"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter your username"
                required
                type="text"
                value={username}
              />
            </span>
          </label>

          <div className="form-field">
            <label className="ui-label" htmlFor="login-password">Password</label>
            <div className="login-form__control">
              <Lock size={16} aria-hidden="true" />
              <input
                autoComplete="current-password"
                className="input-base input-with-icon input-with-clear"
                disabled={isSubmitting}
                id="login-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-controls="login-password"
                aria-pressed={showPassword}
                className="login-form__toggle"
                disabled={isSubmitting}
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {error ? <AsyncNotice kind="error" title={error} /> : null}

          <button
            className="btn-primary login-form__submit"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in to Portal'}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          </form>
        </section>
        {import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_ENABLED === 'true' ? <DevelopmentLogin redirectTo={redirectTo} /> : null}
      </div>
    </div>
  )
}
