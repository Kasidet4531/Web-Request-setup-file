import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  buildRequestValuesForSchema,
  requesterFieldsAreReadOnly,
  resolveRequestFormSchema,
} from './activeSchemaFormState'
import { RequestDraftStatus } from './ActiveSchemaForm'
import type { ActiveFormSchemaResponse } from '../types/forms'
import type { PsfRequestResponse } from '../services/api'

const schemaSnapshot: PsfRequestResponse['schemaSnapshot'] = {
  formKey: 'psf-request',
  version: 1,
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester'],
      fields: [
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Product Type',
          type: 'radio',
          required: true,
          options: ['New Product'],
        },
      ],
    },
  ],
}

const activeRequestSchema: ActiveFormSchemaResponse = {
  formKey: 'psf-request',
  version: 2,
  title: 'PSF Request Form v2',
  description: null,
  status: 'active',
  publishedAt: '2026-06-20T00:00:00.000Z',
  schema: {
    formKey: 'psf-request',
    version: 2,
    title: 'PSF Request Form v2',
    sections: [
      {
        sectionKey: 'requester_information',
        title: 'Requester Information',
        visibleTo: ['requester'],
        fields: [
          {
            fieldKey: 'product_type',
            canonicalKey: 'product_type',
            label: 'Product Type',
            type: 'radio',
            required: true,
            options: ['New Product'],
          },
          {
            fieldKey: 'title',
            canonicalKey: 'title',
            label: 'Title',
            type: 'text',
            required: true,
          },
        ],
      },
    ],
  },
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
    psfCreatedDataVisible: false,
    canEditPsfCreatedData: false,
    psfCreatedInformationSchema: {
      formKey: 'psf-created-information',
      version: 1,
      title: 'PSF Created Information',
      sections: [],
    },
    schemaSnapshot,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
    submittedAt: null,
    psfCreatedAt: null,
    completedAt: null,
    ...overrides,
  }
}

describe('buildRequestValuesForSchema', () => {
  it('preserves matching requester values while dropping obsolete fields from older draft snapshots', () => {
    expect(
      buildRequestValuesForSchema(activeRequestSchema.schema, {
        legacy_field: 'remove me',
        product_type: 'New Product',
      }),
    ).toEqual({
      product_type: 'New Product',
      title: '',
    })
  })
})

describe('resolveRequestFormSchema', () => {
  it('uses the latest active schema while the requester is still editing a draft', () => {
    const resolved = resolveRequestFormSchema('request', buildRequest(), activeRequestSchema)

    expect(resolved).toEqual(activeRequestSchema)
  })

  it('keeps the locked submission snapshot after the request is submitted', () => {
    const submittedRequest = buildRequest({
      formVersion: 2,
      schemaSnapshot: activeRequestSchema.schema,
      status: 'Submitted',
      submittedAt: '2026-06-20T00:00:00.000Z',
    })

    const resolved = resolveRequestFormSchema('request', submittedRequest, activeRequestSchema)

    expect(resolved).toMatchObject({
      status: 'snapshot',
      version: 2,
      schema: activeRequestSchema.schema,
    })
  })
})

describe('requesterFieldsAreReadOnly', () => {
  it('locks requester-owned fields after a successful submission', () => {
    expect(
      requesterFieldsAreReadOnly(
        'request',
        buildRequest({
          status: 'Submitted',
          submittedAt: '2026-06-20T00:00:00.000Z',
        }),
      ),
    ).toBe(true)
  })
})

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
    expect(html).toContain('Open request details')
  })
})
