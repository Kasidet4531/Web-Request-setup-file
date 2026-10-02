import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApiClient,
  fetchCurrentUser,
  loginWithPassword,
  logout,
  refreshCurrentUser,
} from './api'
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

  it.each([401, 403, 503])('announces session expiry only for HTTP 401, not %s', async (status) => {
    const target = new EventTarget()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: target, writable: true })
    Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: TestCustomEvent, writable: true })
    const listener = vi.fn()
    target.addEventListener(AUTH_SESSION_CHANGED_EVENT, listener)
    globalThis.fetch = vi.fn(async () => new Response(null, { status })) as typeof fetch
    await expect(createApiClient().get('/requests')).rejects.toMatchObject({ status })
    expect(listener).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
    if (status === 401) expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: { status: 'anonymous' } }))
  })

  it('leaves initial session-check failures to the caller so stale responses cannot invalidate a newer login', async () => {
    const target = new EventTarget()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: target, writable: true })
    Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: TestCustomEvent, writable: true })
    const listener = vi.fn()
    target.addEventListener(AUTH_SESSION_CHANGED_EVENT, listener)
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch
    await expect(fetchCurrentUser()).rejects.toMatchObject({ status: 401 })
    expect(listener).not.toHaveBeenCalled()
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

  it('loads, saves, and publishes the backend-authorized admin form configuration', async () => {
    const schema = {
      formKey: 'psf-request',
      title: 'PSF Request Form',
      sections: [],
    }
    const draft = {
      createdAt: '2026-08-05T00:00:00.000Z',
      createdBy: 'admin.demo',
      description: 'Editable schema',
      formKey: 'psf-request',
      publishedAt: null,
      schema: { ...schema, version: 2 },
      status: 'draft',
      title: schema.title,
      version: 2,
    }
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ formKey: 'psf-request', versions: [draft] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(draft), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...draft, status: 'active' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })
    const fetchAdminFormConfig = Reflect.get(client, 'fetchAdminFormConfig') as undefined | (() => Promise<unknown>)
    const saveAdminFormConfigDraft = Reflect.get(client, 'saveAdminFormConfigDraft') as
      | undefined
      | ((payload: { draftVersion: number; description?: string | null; schema: typeof schema }) => Promise<unknown>)
    const publishAdminFormConfigDraft = Reflect.get(client, 'publishAdminFormConfigDraft') as
      | undefined
      | ((payload: { version: number }) => Promise<unknown>)

    expect(fetchAdminFormConfig).toBeTypeOf('function')
    expect(saveAdminFormConfigDraft).toBeTypeOf('function')
    expect(publishAdminFormConfigDraft).toBeTypeOf('function')
    if (!fetchAdminFormConfig || !saveAdminFormConfigDraft || !publishAdminFormConfigDraft) {
      return
    }

    await expect(fetchAdminFormConfig()).resolves.toEqual({ formKey: 'psf-request', versions: [draft] })
    await expect(saveAdminFormConfigDraft({ draftVersion: 2, description: 'Editable schema', schema })).resolves.toEqual(draft)
    await expect(publishAdminFormConfigDraft({ version: 2 })).resolves.toEqual({ ...draft, status: 'active' })

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/admin/form-config',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/form-config',
      expect.objectContaining({
        body: JSON.stringify({ draftVersion: 2, description: 'Editable schema', schema }),
        credentials: 'include',
        method: 'PUT',
      }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      '/api/admin/form-config/publish',
      expect.objectContaining({
        body: JSON.stringify({ version: 2 }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('calls the admin form-management duplicate and discard endpoints', async () => {
    const draft = { version: 3, status: 'draft' }
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(draft), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })) as typeof fetch
    const client = createApiClient({ baseUrl: '/api' })
    await expect(client.duplicateAdminFormConfigVersion({ version: 1 })).resolves.toEqual(draft)
    await expect(client.discardAdminFormConfigDraft(3)).resolves.toBeNull()
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/admin/form-config/duplicate', expect.objectContaining({ body: JSON.stringify({ version: 1 }), credentials: 'include', method: 'POST' }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/admin/form-config/draft/3', expect.objectContaining({ credentials: 'include', method: 'DELETE' }))
  })

  it('scopes every admin form-config lifecycle endpoint to PSF Created Information', async () => {
    const formKey = 'psf-created-information' as const
    const schema = { formKey, title: 'Created details', sections: [] }
    const version = { formKey, version: 3, schema: { ...schema, version: 3 }, status: 'draft' }
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ formKey, versions: [version] }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(version), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(version), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...version, status: 'active' }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
    const client = createApiClient({ baseUrl: '/api' })

    await client.fetchAdminFormConfig(formKey)
    await client.saveAdminFormConfigDraft({ draftVersion: 3, schema }, formKey)
    await client.duplicateAdminFormConfigVersion({ version: 2 }, formKey)
    await client.discardAdminFormConfigDraft(3, formKey)
    await client.publishAdminFormConfigDraft({ version: 3 }, formKey)

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/admin/form-config?formKey=psf-created-information', expect.objectContaining({ method: 'GET' }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/admin/form-config?formKey=psf-created-information', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ draftVersion: 3, schema }) }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, '/api/admin/form-config/duplicate?formKey=psf-created-information', expect.objectContaining({ method: 'POST', body: JSON.stringify({ version: 2 }) }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(4, '/api/admin/form-config/draft/3?formKey=psf-created-information', expect.objectContaining({ method: 'DELETE' }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(5, '/api/admin/form-config/publish?formKey=psf-created-information', expect.objectContaining({ method: 'POST', body: JSON.stringify({ version: 3 }) }))
  })

  it('propagates the backend admin authorization error without client-side authority claims', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'Only admins can manage form schema configurations.' }), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })
    const fetchAdminFormConfig = Reflect.get(client, 'fetchAdminFormConfig') as undefined | (() => Promise<unknown>)

    expect(fetchAdminFormConfig).toBeTypeOf('function')
    if (!fetchAdminFormConfig) {
      return
    }

    await expect(fetchAdminFormConfig()).rejects.toMatchObject({
      message: 'Only admins can manage form schema configurations.',
      name: 'ApiError',
      status: 403,
    })
  })

  it('propagates backend save and publish errors from their admin form-config paths', async () => {
    const schema = {
      formKey: 'psf-request' as const,
      title: 'PSF Request Form',
      sections: [],
    }
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Schema validation failed.' }), {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Draft is no longer publishable.' }), {
          status: 409,
          statusText: 'Conflict',
          headers: { 'content-type': 'application/json' },
        }),
      ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(
      client.saveAdminFormConfigDraft({ draftVersion: 2, description: 'Editable schema', schema }),
    ).rejects.toMatchObject({ message: 'Schema validation failed.', name: 'ApiError', status: 400 })
    await expect(client.publishAdminFormConfigDraft({ version: 2 })).rejects.toMatchObject({
      message: 'Draft is no longer publishable.',
      name: 'ApiError',
      status: 409,
    })
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/admin/form-config',
      expect.objectContaining({
        body: JSON.stringify({ draftVersion: 2, description: 'Editable schema', schema }),
        credentials: 'include',
        method: 'PUT',
      }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/form-config/publish',
      expect.objectContaining({
        body: JSON.stringify({ version: 2 }),
        credentials: 'include',
        method: 'POST',
      }),
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
    await expect(client.updateDraftRequesterData('request-1', {
      formVersion: 3,
      expectedUpdatedAt: '2026-10-01T01:02:03.123456Z',
      requesterData: { title: 'Updated' },
    })).resolves.toMatchObject({
      requesterData: { title: 'Updated' },
    })

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/requests/request-1', expect.objectContaining({ method: 'GET' }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/requests/request-1/requester-data', expect.objectContaining({
      body: JSON.stringify({ formVersion: 3, expectedUpdatedAt: '2026-10-01T01:02:03.123456Z', requesterData: { title: 'Updated' } }),
      method: 'PUT',
    }))
  })

  it('upgrades an older Draft schema only through the explicit expected active version endpoint', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'request-1', formVersion: 2, status: 'Draft' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch
    const client = createApiClient({ baseUrl: '/api' })
    const upgradeDraftSchema = Reflect.get(client, 'upgradeDraftSchema') as
      | undefined
      | ((requestId: string, payload: { formVersion: number }) => Promise<unknown>)

    expect(upgradeDraftSchema).toBeTypeOf('function')
    if (!upgradeDraftSchema) {
      return
    }

    await expect(upgradeDraftSchema('request-1', { formVersion: 2 })).resolves.toMatchObject({
      formVersion: 2,
      id: 'request-1',
      status: 'Draft',
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/requests/request-1/upgrade-schema',
      expect.objectContaining({
        body: JSON.stringify({ formVersion: 2 }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('loads a request-scoped history through the authenticated detail API path', async () => {
    const history = [
      {
        actionType: 'REQUEST_STATUS_CHANGED',
        actorDisplayName: 'Setup Owner GNTC Demo',
        actorRole: 'setup_owner',
        createdAt: '2026-06-18T01:06:03.000Z',
        metadata: {
          fromStatus: 'Submitted',
          toStatus: 'Setup In Progress',
        },
      },
    ]
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(history), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })
    const fetchPsfRequestHistory = Reflect.get(
      client,
      'fetchPsfRequestHistory',
    ) as undefined | ((requestId: string) => Promise<typeof history>)

    expect(fetchPsfRequestHistory).toBeTypeOf('function')
    if (!fetchPsfRequestHistory) {
      return
    }

    await expect(fetchPsfRequestHistory('request-1')).resolves.toEqual(history)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/requests/request-1/history',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
  })

  it('serializes global audit filters for the authenticated audit-log API path', async () => {
    const history = [
      {
        requestId: 'request-1',
        requestNo: 'PSF-0001',
        actionType: 'REQUEST_STATUS_CHANGED',
        actorDisplayName: 'Setup Owner GNTC Demo',
        actorRole: 'setup_owner',
        createdAt: '2026-06-19T01:02:03.000Z',
        metadata: {},
      },
    ]
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(history), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })
    const fetchGlobalAuditLogs = Reflect.get(
      client,
      'fetchGlobalAuditLogs',
    ) as undefined | ((filters: {
      requestId?: string
      user?: string
      actionType?: string
      from?: string
      to?: string
    }) => Promise<typeof history>)

    expect(fetchGlobalAuditLogs).toBeTypeOf('function')
    if (!fetchGlobalAuditLogs) {
      return
    }

    await expect(fetchGlobalAuditLogs({
      requestId: 'request-1',
      user: 'setup.gntc',
      actionType: 'REQUEST_STATUS_CHANGED',
      from: '2026-06-18',
      to: '2026-06-19',
    })).resolves.toEqual(history)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/audit-logs?requestId=request-1&user=setup.gntc&actionType=REQUEST_STATUS_CHANGED&from=2026-06-18&to=2026-06-19',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
  })

  it('updates PSF Created Information through the authenticated request endpoint', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        id: 'request-1',
        status: 'Setup In Progress',
        psfCreatedData: { psf_setup_file_name: 'final-setup.psf' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })
    const updatePsfCreatedData = Reflect.get(
      client,
      'updatePsfCreatedData',
    ) as undefined | ((
      requestId: string,
      payload: {
        expectedUpdatedAt: string
        psfCreatedData: Record<string, string>
      },
    ) => Promise<unknown>)

    expect(updatePsfCreatedData).toBeTypeOf('function')
    if (!updatePsfCreatedData) {
      return
    }

    await expect(
      updatePsfCreatedData('request-1', {
        expectedUpdatedAt: '2026-06-18T01:05:03.000Z',
        psfCreatedData: { psf_setup_file_name: 'final-setup.psf' },
      }),
    ).resolves.toMatchObject({
      psfCreatedData: { psf_setup_file_name: 'final-setup.psf' },
    })
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/requests/request-1/psf-created-data', expect.objectContaining({
      body: JSON.stringify({
        expectedUpdatedAt: '2026-06-18T01:05:03.000Z',
        psfCreatedData: { psf_setup_file_name: 'final-setup.psf' },
      }),
      method: 'PUT',
    }))
  })

  it('loads backend-authoritative workflow options for a request detail', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        allowedNextStatuses: ['Setup In Progress', 'Need More Information', 'Rejected'],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.fetchPsfRequestStatusOptions('request-1')).resolves.toEqual({
      allowedNextStatuses: ['Setup In Progress', 'Need More Information', 'Rejected'],
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/requests/request-1/status-options',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('submits a draft request by id', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'request-1', status: 'Submitted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.submitPsfRequest('request-1', { formVersion: 4, status: 'Submitted', expectedUpdatedAt: '2026-10-01T01:02:03.123456Z' })).resolves.toMatchObject({
      id: 'request-1',
      status: 'Submitted',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/requests/request-1/submit', expect.objectContaining({
      body: JSON.stringify({ formVersion: 4, status: 'Submitted', expectedUpdatedAt: '2026-10-01T01:02:03.123456Z' }),
      method: 'POST',
    }))
  })

  it('updates workflow status and loads the next server-authorized options through backend endpoints', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'request-1', status: 'Setup In Progress' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ allowedNextStatuses: ['PSF Created', 'Need More Information', 'Rejected'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(client.queryPsfRequests({ keyword: 'probe', status: 'Submitted', limit: 25 })).resolves.toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    })
    await expect(client.updatePsfRequestStatus('request-1', { status: 'Setup In Progress', expectedUpdatedAt: '2026-10-01T01:02:03.123456Z' })).resolves.toMatchObject({
      id: 'request-1',
      status: 'Setup In Progress',
    })
    await expect(client.fetchPsfRequestStatusOptions('request-1')).resolves.toEqual({
      allowedNextStatuses: ['PSF Created', 'Need More Information', 'Rejected'],
    })

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/requests?keyword=probe&status=Submitted&limit=25',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/requests/request-1/status', expect.objectContaining({
      body: JSON.stringify({ status: 'Setup In Progress', expectedUpdatedAt: '2026-10-01T01:02:03.123456Z' }),
      method: 'PUT',
    }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      '/api/requests/request-1/status-options',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('loads and applies one optimistic status-catalog operation', async () => {
    const configuration = {
      statuses: ['Submitted', 'Setup In Progress'],
      entries: [
        { id: 'draft-id', name: 'Draft', kind: 'draft', requestCount: null },
        { id: 'submitted-id', name: 'Submitted', kind: 'open', requestCount: 2 },
      ],
      psfVisibilityTriggerId: null,
      updatedAt: '2026-10-01T01:02:03.123456Z',
    }
    const operation = { action: 'rename' as const, id: 'submitted-id', name: 'Custom Review', expectedUpdatedAt: configuration.updatedAt }
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(configuration), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(configuration), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
    const client = createApiClient({ baseUrl: '/api' })
    await expect(client.fetchAdminWorkflowTransitionConfiguration()).resolves.toEqual(configuration)
    await expect(client.replaceAdminWorkflowTransitionConfiguration(operation)).resolves.toEqual(configuration)
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/admin/workflow', expect.objectContaining({ credentials: 'include', method: 'GET' }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/admin/workflow', expect.objectContaining({ body: JSON.stringify(operation), credentials: 'include', method: 'PUT' }))
  })

  it('reads the public catalog without private usage counts', async () => {
    const response = { statuses: ['Submitted', 'Need More Information'], entries: [{ id: 'entry-1', name: 'Submitted', kind: 'open' }], psfVisibilityTriggerId: null, updatedAt: '2026-10-01T01:02:03.123456Z' }
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
    const client = createApiClient({ baseUrl: '/api' })
    const catalog = await client.fetchWorkflowStatuses()
    expect(catalog).toEqual(response)
    expect(catalog.updatedAt).toBe(response.updatedAt)
    expect(catalog.entries[0]).not.toHaveProperty('requestCount')
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/workflow/statuses', expect.objectContaining({ credentials: 'include', method: 'GET' }))
  })

  it('lists, creates, and edits administrator autofill rules through canonical-key endpoints', async () => {
    const rule = {
      id: 'f0e9b091-8ee5-4d92-90ed-c4ac8ec01845',
      formKey: 'psf-request',
      triggerCanonicalKey: 'reference_psf_name',
      targetCanonicalKeys: ['product', 'wafer_fab'],
      lookupSource: 'previous_completed_submission',
      status: 'active',
      createdAt: '2026-08-11T10:00:00.000Z',
      updatedAt: '2026-08-11T10:00:00.000Z',
    }
    const updatedRule = {
      ...rule,
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['product'],
      updatedAt: '2026-08-11T11:00:00.000Z',
    }
    const createPayload = {
      formKey: 'psf-request',
      triggerCanonicalKey: 'reference_psf_name',
      targetCanonicalKeys: ['product', 'wafer_fab'],
    }
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([rule]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(rule), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(updatedRule), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })
    const fetchAdminAutofillRules = Reflect.get(client, 'fetchAdminAutofillRules') as
      | undefined
      | (() => Promise<typeof rule[]>)
    const createAdminAutofillRule = Reflect.get(client, 'createAdminAutofillRule') as
      | undefined
      | ((payload: typeof createPayload) => Promise<typeof rule>)
    const updateAdminAutofillRule = Reflect.get(client, 'updateAdminAutofillRule') as
      | undefined
      | ((ruleId: string, payload: typeof createPayload) => Promise<typeof updatedRule>)

    expect(fetchAdminAutofillRules).toBeTypeOf('function')
    expect(createAdminAutofillRule).toBeTypeOf('function')
    expect(updateAdminAutofillRule).toBeTypeOf('function')
    if (
      !fetchAdminAutofillRules ||
      !createAdminAutofillRule ||
      !updateAdminAutofillRule
    ) {
      return
    }

    await expect(fetchAdminAutofillRules()).resolves.toEqual([rule])
    await expect(createAdminAutofillRule(createPayload)).resolves.toEqual(rule)
    await expect(
      updateAdminAutofillRule(rule.id, {
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_product',
        targetCanonicalKeys: ['product'],
      }),
    ).resolves.toEqual(updatedRule)

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/admin/autofill',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/autofill',
      expect.objectContaining({
        body: JSON.stringify(createPayload),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      `/api/admin/autofill/${rule.id}`,
      expect.objectContaining({
        body: JSON.stringify({
          formKey: 'psf-request',
          triggerCanonicalKey: 'reference_product',
          targetCanonicalKeys: ['product'],
        }),
        credentials: 'include',
        method: 'PUT',
      }),
    )
  })

  it('loads and updates user records through backend-authorized admin endpoints', async () => {
    const updatedUser = {
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    }
    const listedUser = { ...updatedUser, email: 'owner@example.test' }
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([listedUser]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(updatedUser), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })
    const fetchAdminUsers = Reflect.get(client, 'fetchAdminUsers') as
      | undefined
      | (() => Promise<typeof listedUser[]>)
    const updateAdminUser = Reflect.get(client, 'updateAdminUser') as
      | undefined
      | ((
        userId: string,
        payload: { role: 'requester' | 'setup_owner' | 'admin'; setupOwnerDepartment: 'GNTC' | 'MFG' | null },
      ) => Promise<typeof updatedUser>)

    expect(fetchAdminUsers).toBeTypeOf('function')
    expect(updateAdminUser).toBeTypeOf('function')
    if (!fetchAdminUsers || !updateAdminUser) {
      return
    }

    await expect(fetchAdminUsers()).resolves.toEqual([listedUser])
    await expect(
      updateAdminUser(updatedUser.id, {
        role: 'setup_owner',
        setupOwnerDepartment: 'GNTC',
      }),
    ).resolves.toEqual(updatedUser)

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/admin/users',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/users/setup-owner-1',
      expect.objectContaining({
        body: JSON.stringify({
          role: 'setup_owner',
          setupOwnerDepartment: 'GNTC',
        }),
        credentials: 'include',
        method: 'PUT',
      }),
    )
  })

  it('announces a freshly fetched profile when management updates refresh the session', async () => {
    const user = {
      id: 'user-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    }
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ user }), {
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
    const listener = vi.fn()
    eventTarget.addEventListener(AUTH_SESSION_CHANGED_EVENT, listener)

    await expect(refreshCurrentUser()).resolves.toEqual({ user })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { status: 'authenticated', user },
      }),
    )
  })

  it('loads runtime autofill suggestions through the authenticated canonical-query endpoint', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          matched: true,
          suggestedValues: { product: 'New Product' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as typeof fetch

    const client = createApiClient({ baseUrl: '/api' })

    await expect(
      client.fetchRuntimeAutofillSuggestions({
        formKey: 'psf-request',
        field: 'reference_psf_name',
        value: 'REF & PSF',
      }),
    ).resolves.toEqual({
      matched: true,
      suggestedValues: { product: 'New Product' },
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/autofill?formKey=psf-request&field=reference_psf_name&value=REF+%26+PSF',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
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
