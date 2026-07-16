import type { ActiveFormSchemaResponse, DynamicFormValues, FormSchema } from '../types/forms'
import { notifyAuthSessionChanged } from './auth-session'

export interface ApiClientConfig {
  baseUrl?: string
  headers?: HeadersInit
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | object | null
}

export class ApiError extends Error {
  readonly status: number
  readonly statusText: string
  readonly details: unknown

  constructor(message: string, status: number, statusText: string, details: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.details = details
  }
}

function normalizePath(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  return path.startsWith('/') ? path : `/${path}`
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedPath = normalizePath(path)

  if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
    return normalizedPath
  }

  return `${baseUrl.replace(/\/$/, '')}${normalizedPath}`
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text.length > 0 ? text : null
}

function buildQueryPath(path: string, query: object): string {
  const params = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === '') {
      return
    }

    params.set(key, String(value))
  })

  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

export interface PsfRequestPayload {
  requester?: string
  requesterData: DynamicFormValues
}

export interface PsfRequestQuery {
  keyword?: string
  status?: string
  priority?: string
  productType?: string
  requester?: string
  setupOwner?: string
  setupOwnerRole?: string
  dueDateFrom?: string
  dueDateTo?: string
  requestDateFrom?: string
  requestDateTo?: string
  limit?: number
  offset?: number
}

export interface PsfRequestListItem {
  requestId: string
  requestNo: string
  title: string | null
  referencePsfName: string | null
  psfSetupFileName: string | null
  probecardName: string | null
  status: string
  priority: string | null
  requester: string | null
  setupOwner: string | null
  setupOwnerRole: string | null
  productType: string | null
  requestDate: string | null
  dueDate: string | null
  updatedAt: string
}

export interface PsfRequestListResponse {
  items: PsfRequestListItem[]
  total: number
  limit: number
  offset: number
}

export interface UpdatePsfRequestStatusPayload {
  status: string
}

export interface PsfRequestStatusOptionsResponse {
  allowedNextStatuses: string[]
}

export interface SubmitPsfRequestPayload {
  formVersion: number
}

export interface PsfRequestResponse {
  id: string
  requestNo: string
  formKey: string
  formVersion: number
  status: string
  requester: string | null
  setupOwner: string | null
  setupOwnerRole: string | null
  productType: string | null
  requesterData: DynamicFormValues
  psfCreatedData: Record<string, unknown>
  schemaSnapshot: FormSchema
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  psfCreatedAt: string | null
  completedAt: string | null
}

export function createApiClient(config: ApiClientConfig = {}) {
  const baseUrl = config.baseUrl ?? '/api'
  const defaultHeaders = config.headers ?? {}

  async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(defaultHeaders)
    const method = options.method ?? 'GET'
    const url = buildUrl(baseUrl, path)

    if (options.headers) {
      new Headers(options.headers).forEach((value, key) => headers.set(key, value))
    }

    const body = (options.body ?? null) as unknown
    let requestBody: BodyInit | null | undefined = body as BodyInit | null | undefined

    if (
      body !== null &&
      body !== undefined &&
      typeof body === 'object' &&
      !(body instanceof FormData) &&
      !(body instanceof URLSearchParams) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer)
    ) {
      headers.set('content-type', 'application/json')
      requestBody = JSON.stringify(body)
    }

    const response = await fetch(url, {
      ...options,
      body: requestBody,
      credentials: options.credentials ?? 'include',
      headers,
      method,
    })

    const responseBody = await parseResponseBody(response)

    if (!response.ok) {
      const message =
        typeof responseBody === 'object' &&
        responseBody !== null &&
        'message' in responseBody &&
        typeof responseBody.message === 'string'
          ? responseBody.message
          : response.statusText || 'Request failed'

      throw new ApiError(message, response.status, response.statusText, responseBody)
    }

    return responseBody as T
  }

  return {
    request,
    get: <T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body?: ApiRequestOptions['body'], options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, body, method: 'POST' }),
    put: <T>(path: string, body?: ApiRequestOptions['body'], options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, body, method: 'PUT' }),
    delete: <T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
      request<T>(path, { ...options, method: 'DELETE' }),
    fetchActiveFormSchema: (formKey: string) =>
      request<ActiveFormSchemaResponse>(`/forms/${encodeURIComponent(formKey)}/schema`, {
        method: 'GET',
      }),
    queryPsfRequests: (query: PsfRequestQuery = {}) =>
      request<PsfRequestListResponse>(buildQueryPath('/requests', query), {
        method: 'GET',
      }),
    createDraftRequest: (payload: PsfRequestPayload) =>
      request<PsfRequestResponse>('/requests', {
        body: payload,
        method: 'POST',
      }),
    fetchPsfRequest: (requestId: string) =>
      request<PsfRequestResponse>(`/requests/${encodeURIComponent(requestId)}`, {
        method: 'GET',
      }),
    fetchPsfRequestStatusOptions: (requestId: string) =>
      request<PsfRequestStatusOptionsResponse>(`/requests/${encodeURIComponent(requestId)}/status-options`, {
        method: 'GET',
      }),
    updateDraftRequesterData: (requestId: string, payload: PsfRequestPayload) =>
      request<PsfRequestResponse>(`/requests/${encodeURIComponent(requestId)}/requester-data`, {
        body: payload,
        method: 'PUT',
      }),
    submitPsfRequest: (requestId: string, payload: SubmitPsfRequestPayload) =>
      request<PsfRequestResponse>(`/requests/${encodeURIComponent(requestId)}/submit`, {
        body: payload,
        method: 'POST',
      }),
    updatePsfRequestStatus: (requestId: string, payload: UpdatePsfRequestStatusPayload) =>
      request<PsfRequestResponse>(`/requests/${encodeURIComponent(requestId)}/status`, {
        body: payload,
        method: 'PUT',
      }),
  }
}

export interface HealthCheckResponse {
  status: string
  database: {
    status: string
    message?: string
  }
}

export type UserRole = 'requester' | 'setup_owner' | 'admin'

export interface AuthenticatedUserProfile {
  id: string
  username: string
  displayName: string
  role: UserRole
  setupOwnerDepartment: 'GNTC' | 'MFG' | null
}

export interface AuthResponse {
  user: AuthenticatedUserProfile
}

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
})

export async function fetchHealthStatus() {
  return api.get<HealthCheckResponse>('/health')
}

export async function fetchCurrentUser() {
  return api.get<AuthResponse>('/me')
}

export async function loginWithPassword(username: string, password: string) {
  const response = await api.post<AuthResponse>('/login', { username, password })
  notifyAuthSessionChanged({ status: 'authenticated', user: response.user })
  return response
}

export async function logout() {
  const response = await api.post<null>('/logout')
  notifyAuthSessionChanged({ status: 'anonymous' })
  return response
}
