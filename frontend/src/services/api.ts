import type { ActiveFormSchemaResponse } from '../types/forms'

export interface ApiClientConfig {
  baseUrl?: string
  headers?: HeadersInit
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | null
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
      request<ActiveFormSchemaResponse>(`/admin/form-definitions/${encodeURIComponent(formKey)}/active`, {
        method: 'GET',
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

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
})

export async function fetchHealthStatus() {
  return api.get<HealthCheckResponse>('/health')
}
