import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, User } from 'lucide-react'
import { ApiError, loginWithPassword } from '../../services/api'
import nxpLogo from '../../assets/NXP.png'

export function LoginPage() {
  const navigate = useNavigate()
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
      await navigate({ to: '/dashboard' })
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
      <div className="login-page__content">
        <div className="login-card__brand">
          <img src={nxpLogo} alt="NXP Semiconductors" />
          <div>
            <h1>PSF Request Portal</h1>
            <p>Sign in to manage PSF setup files and workflow requests</p>
          </div>
        </div>

        <section className="page-card login-card">
          <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="form-field">
            <span>Username</span>
            <span className="login-form__control">
              <User size={18} />
              <input
                autoComplete="username"
                className="input-base input-with-icon"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter your username"
                required
                type="text"
                value={username}
              />
            </span>
          </label>

          <label className="form-field">
            <span>Password</span>
            <span className="login-form__control">
              <Lock size={18} />
              <input
                autoComplete="current-password"
                className="input-base input-with-icon input-with-clear"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="login-form__toggle"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          {error ? (
            <p className="login-form__error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </p>
          ) : null}

          <button
            className="btn-primary login-form__submit"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in to Portal'}
            <ArrowRight size={16} />
          </button>
          </form>
        </section>
      </div>
    </div>
  )
}
