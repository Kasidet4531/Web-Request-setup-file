import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient, fetchCurrentUser, loginWithPassword, logout } from './api'

describe('createApiClient', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
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

  it('uses session cookies for auth helpers', async () => {
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
  })

  it('fetches the active form schema for the requested form key', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ formKey: 'psf-request', version: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.fetchActiveFormSchema('psf-request')).resolves.toMatchObject({
      formKey: 'psf-request',
      version: 1,
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/forms/psf-request/schema',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('creates a draft request from requester form values', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'request-1', status: 'Draft' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.createDraftRequest({ requesterData: { product_type: 'New Product' } })).resolves.toEqual({
      id: 'request-1',
      status: 'Draft',
    })
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/requests', expect.objectContaining({
      body: JSON.stringify({ requesterData: { product_type: 'New Product' } }),
      method: 'POST',
    }))
  })

  it('loads and updates a draft request by id', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'request-1', status: 'Draft' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'request-1', status: 'Draft', requesterData: { title: 'Updated' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.fetchPsfRequest('request-1')).resolves.toMatchObject({ id: 'request-1' })
    await expect(client.updateDraftRequesterData('request-1', { requesterData: { title: 'Updated' } })).resolves.toMatchObject({
      requesterData: { title: 'Updated' },
    })

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/requests/request-1', expect.objectContaining({ method: 'GET' }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/requests/request-1/requester-data', expect.objectContaining({
      body: JSON.stringify({ requesterData: { title: 'Updated' } }),
      method: 'PUT',
    }))
  })

  it('submits a draft request by id', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'request-1', status: 'Submitted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.submitPsfRequest('request-1', { formVersion: 4 })).resolves.toMatchObject({
      id: 'request-1',
      status: 'Submitted',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/requests/request-1/submit', expect.objectContaining({
      body: JSON.stringify({ formVersion: 4 }),
      method: 'POST',
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
