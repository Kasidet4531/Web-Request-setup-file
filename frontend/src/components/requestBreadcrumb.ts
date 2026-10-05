import { createContext } from 'react'

export type RequestBreadcrumb = { requestId: string; requestNo: string; isDraft?: boolean }
export const RequestBreadcrumbContext = createContext<(value: RequestBreadcrumb | null) => void>(() => {})

export function requestParent(pathname: string, request: RequestBreadcrumb | null): { to: string; label: string } {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] === 'requests' && segments[1] && segments[2] === 'history') {
    return { to: `/requests/${encodeURIComponent(segments[1])}`, label: 'request' }
  }
  return request?.isDraft && request.requestId === segments[1] && segments[1] !== 'new'
    ? { to: '/my-drafts', label: 'My Drafts' }
    : { to: '/requests', label: 'Requests' }
}

export function requestDocumentTitle(pathname: string, request: RequestBreadcrumb | null, fallback: string): string {
  const segments = pathname.split('/').filter(Boolean)
  const title = request && segments[0] === 'requests' && request.requestId === segments[1]
    ? `${request.requestNo}${segments[2] === 'history' ? ' history' : ''}`
    : fallback
  return `${title} · PSF Request Portal`
}
