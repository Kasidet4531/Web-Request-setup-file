import { createContext } from 'react'

export type RequestBreadcrumb = { requestId: string; requestNo: string }
export const RequestBreadcrumbContext = createContext<(value: RequestBreadcrumb | null) => void>(() => {})

export function requestDocumentTitle(pathname: string, request: RequestBreadcrumb | null, fallback: string): string {
  const segments = pathname.split('/').filter(Boolean)
  const title = request && segments[0] === 'requests' && request.requestId === segments[1]
    ? `${request.requestNo}${segments[2] === 'history' ? ' history' : ''}`
    : fallback
  return `${title} · PSF Request Portal`
}
