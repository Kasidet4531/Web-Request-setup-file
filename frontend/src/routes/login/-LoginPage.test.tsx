import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LoginPage } from './-LoginPage'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

afterEach(() => vi.unstubAllEnvs())

describe('local login visibility', () => {
  it('provides an accessible theme control on company sign-in', () => {
    expect(renderToStaticMarkup(<LoginPage />)).toContain('aria-label="Switch to dark mode"')
  })
  it('offers the four local roles only when explicitly enabled in development', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEV_AUTH_ENABLED', 'true')
    const html = renderToStaticMarkup(<LoginPage />)
    expect(html).toContain('Local test accounts')
    expect(html).toContain('Requester')
    expect(html).toContain('Setup File Owner — GNTC')
    expect(html).toContain('Setup File Owner — MFG')
    expect(html).toContain('Admin')
    expect(html).toContain('Username')
  })

  it.each([undefined, 'false'])('hides local accounts with flag %s', (flag) => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEV_AUTH_ENABLED', flag)
    expect(renderToStaticMarkup(<LoginPage />)).not.toContain('Local test accounts')
  })

  it('hides local accounts in a production build even if the flag is enabled', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEV_AUTH_ENABLED', 'true')
    expect(renderToStaticMarkup(<LoginPage />)).not.toContain('Local test accounts')
  })
})
