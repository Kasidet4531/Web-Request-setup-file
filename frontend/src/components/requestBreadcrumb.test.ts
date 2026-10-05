import { describe, expect, it } from 'vitest'
import { requestDocumentTitle, requestParent } from './requestBreadcrumb'

describe('resolved request document titles', () => {
  it.each(['/requests', '/requests/'])('handles the request list without a resolved identity: %s', (pathname) => {
    expect(requestDocumentTitle(pathname, null, 'All PSF Requests')).toBe('All PSF Requests · PSF Request Portal')
  })
  it('uses resolved identity for detail and history', () => {
    const request = { requestId: 'request-1', requestNo: 'PSF-0042' }
    expect(requestDocumentTitle('/requests/request-1', request, 'Request detail')).toBe('PSF-0042 · PSF Request Portal')
    expect(requestDocumentTitle('/requests/request-1/history', request, 'Audit History')).toBe('PSF-0042 history · PSF Request Portal')
  })
  it('ignores identity belonging to another route', () => {
    expect(requestDocumentTitle('/requests/request-2', { requestId: 'request-1', requestNo: 'PSF-0042' }, 'Request detail')).toBe('Request detail · PSF Request Portal')
  })
})

describe('request parent navigation', () => {
  it('returns to private My Drafts only for the resolved Draft on the current route', () => {
    const request = { requestId: 'uuid-1', requestNo: 'DRAFT-0042', isDraft: true }
    expect(requestParent('/requests/uuid-1', request)).toEqual({ to: '/my-drafts', label: 'My Drafts' })
    expect(requestParent('/requests/uuid-2', request)).toEqual({ to: '/requests', label: 'Requests' })
    expect(requestParent('/requests/new', request)).toEqual({ to: '/requests', label: 'Requests' })
  })
  it('returns request history to its UUID detail regardless of its displayed number', () => {
    expect(requestParent('/requests/uuid-1/history', { requestId: 'uuid-1', requestNo: 'PSF-2026-0042', isDraft: true })).toEqual({ to: '/requests/uuid-1', label: 'request' })
  })
})
