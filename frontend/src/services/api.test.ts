import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient, fetchCurrentUser, loginWithPassword, logout } from './api'
import { AUTH_SESSION_CHANGED_EVENT } from './auth-session'

describe('createApiClient', () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const originalCustomEvent = globalThis.CustomEvent

  class TestCustomEvent<T> extends Event {
    detail: T

    constructor(type: string, init: CustomEventInit<T>) {
      super(type)
      this.detail = init.detail as T
    }
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
      writable: true,
    })
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: originalCustomEvent,
      writable: true,
    })
  })

  it('returns parsed JSON for successful GET requests', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.get<{ status: string }>('/health')).resolves.toEqual({ status: 'ok' })
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({
      credentials: 'include',
      method: 'GET',
    }))
  })

  it('throws ApiError with backend details for non-2xx responses', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'database unavailable' }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.get('/health')).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'database unavailable',
    })
  })

  it('uses session cookies for auth helpers and announces successful login', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        user: {
          id: 'user-1',
          username: 'admin.demo',
          displayName: 'Admin Demo',
          role: 'admin',
          setupOwnerDepartment: null,
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch
    const eventTarget = new EventTarget()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: eventTarget,
      writable: true,
    })
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: TestCustomEvent,
      writable: true,
    })
    const authSessionChangedListener = vi.fn()
    eventTarget.addEventListener(AUTH_SESSION_CHANGED_EVENT, authSessionChangedListener)

    await expect(fetchCurrentUser()).resolves.toMatchObject({
      user: { username: 'admin.demo', role: 'admin' },
    })
    await expect(loginWithPassword('admin.demo', 'AdminDemo123!')).resolves.toMatchObject({
      user: { username: 'admin.demo', role: 'admin' },
    })

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/me', expect.objectContaining({
      credentials: 'include',
      method: 'GET',
    }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/login', expect.objectContaining({
      body: JSON.stringify({ username: 'admin.demo', password: 'AdminDemo123!' }),
      credentials: 'include',
      method: 'POST',
    }))
    expect(authSessionChangedListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        status: 'authenticated',
        user: expect.objectContaining({ username: 'admin.demo' }),
      }),
    }))
  })

  it('posts logout with the current session cookie', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch

    await expect(logout()).resolves.toBeNull()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/logout', expect.objectContaining({
      credentials: 'include',
      method: 'POST',
    }))
  })
})
