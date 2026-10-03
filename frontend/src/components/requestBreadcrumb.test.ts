import { describe, expect, it } from 'vitest'
import { requestDocumentTitle } from './requestBreadcrumb'

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
