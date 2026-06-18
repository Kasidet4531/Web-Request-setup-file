import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RequestDraftStatus } from './ActiveSchemaForm'
import type { PsfRequestResponse } from '../services/api'

const schemaSnapshot: PsfRequestResponse['schemaSnapshot'] = {
  formKey: 'psf-request',
  version: 1,
  title: 'PSF Request Form',
  sections: [],
}

function buildRequest(overrides: Partial<PsfRequestResponse> = {}): PsfRequestResponse {
  return {
    id: 'request-1',
    requestNo: 'DRAFT-0001',
    formKey: 'psf-request',
    formVersion: 1,
    status: 'Draft',
    requester: 'requester@example.com',
    setupOwner: null,
    setupOwnerRole: null,
    productType: null,
    requesterData: {},
    psfCreatedData: {},
    schemaSnapshot,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
    submittedAt: null,
    psfCreatedAt: null,
    completedAt: null,
    ...overrides,
  }
}

describe('RequestDraftStatus', () => {
  it('surfaces a requester-facing reopen link for a saved draft', () => {
    const html = renderToStaticMarkup(<RequestDraftStatus request={buildRequest()} />)

    expect(html).toContain('DRAFT-0001')
    expect(html).toContain('Draft')
    expect(html).toContain('href="/requests/request-1/"')
    expect(html).toContain('Open saved draft')
  })

  it('keeps the detail link visible when requester edits are locked', () => {
    const html = renderToStaticMarkup(<RequestDraftStatus request={buildRequest({ status: 'Submitted' })} />)

    expect(html).toContain('Submitted')
    expect(html).toContain('requester-owned fields are locked after Draft status')
    expect(html).toContain('href="/requests/request-1/"')
  })
})
