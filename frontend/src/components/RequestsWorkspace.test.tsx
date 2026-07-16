import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RequestHeaderSummary } from './RequestsWorkspace'
import { requesterFieldsAreReadOnly } from './activeSchemaFormState'
import type { PsfRequestResponse } from '../services/api'

function buildSubmittedRequest(): PsfRequestResponse {
  return {
    id: 'request-1',
    requestNo: 'PSF-0001',
    formKey: 'psf-request',
    formVersion: 4,
    status: 'Submitted',
    requester: null,
    setupOwner: 'Lin',
    setupOwnerRole: 'GNTC',
    productType: null,
    requesterData: {
      request_title_v4: 'Production probe card setup',
      requester_v4: 'Fook',
      product_kind_v4: 'Existing Product',
      delivery_by_v4: '2026-08-05',
      urgency_v4: 'Urgent',
    },
    psfCreatedData: {},
    schemaSnapshot: {
      formKey: 'psf-request',
      version: 4,
      title: 'PSF Request Form',
      sections: [
        {
          sectionKey: 'requester_information',
          title: 'Requester Information',
          visibleTo: ['requester', 'setup_owner', 'admin'],
          fields: [
            {
              fieldKey: 'request_title_v4',
              canonicalKey: 'title',
              label: 'Title',
              type: 'text',
              required: true,
            },
            {
              fieldKey: 'requester_v4',
              canonicalKey: 'requester',
              label: 'Requester',
              type: 'text',
              required: true,
            },
            {
              fieldKey: 'product_kind_v4',
              canonicalKey: 'product_type',
              label: 'Product Type',
              type: 'select',
              required: true,
            },
            {
              fieldKey: 'delivery_by_v4',
              canonicalKey: 'due_date',
              label: 'Due Date',
              type: 'date',
              required: true,
            },
            {
              fieldKey: 'urgency_v4',
              canonicalKey: 'priority',
              label: 'Priority',
              type: 'select',
              required: true,
            },
          ],
        },
      ],
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    submittedAt: '2026-08-01T00:00:00.000Z',
    psfCreatedAt: null,
    completedAt: null,
  }
}

describe('RequestHeaderSummary', () => {
  it('uses the submitted schema snapshot for header metadata while requester data stays read-only', () => {
    const request = buildSubmittedRequest()
    const html = renderToStaticMarkup(<RequestHeaderSummary request={request} />)

    expect(html).toContain('Request No.')
    expect(html).toContain('PSF-0001')
    expect(html).toContain('Production probe card setup')
    expect(html).toContain('Existing Product')
    expect(html).toContain('status-badge--submitted')
    expect(html).toContain('Urgent')
    expect(html).toContain('05/08/2026')
    expect(html).toContain('Fook')
    expect(html).toContain('Lin / GNTC')
    expect(requesterFieldsAreReadOnly('request', request)).toBe(true)
  })
})
