import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentType } from 'react'
import { describe, expect, it } from 'vitest'
import * as activeSchemaFormState from './activeSchemaFormState'
import * as activeSchemaForm from './ActiveSchemaForm'
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
  it('keeps an older Draft on its snapshot until the requester explicitly upgrades it', () => {
    const resolved = resolveRequestFormSchema('request', buildRequest(), activeRequestSchema)

    expect(resolved).toMatchObject({
      status: 'snapshot',
      version: 1,
      schema: schemaSnapshot,
    })
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

describe('classifyDraftSchemaVersion', () => {
  it('distinguishes older, equal, newer, and inconsistent Draft schemas without selecting a downgrade path', () => {
    const classifyDraftSchemaVersion = Reflect.get(
      activeSchemaFormState,
      'classifyDraftSchemaVersion',
    ) as
      | undefined
      | ((
        mode: 'request' | 'preview',
        request: PsfRequestResponse,
        activeSchema: ActiveFormSchemaResponse | null,
      ) => string)

    expect(classifyDraftSchemaVersion).toBeTypeOf('function')
    if (!classifyDraftSchemaVersion) {
      return
    }

    expect(classifyDraftSchemaVersion('request', buildRequest(), activeRequestSchema)).toBe('older')
    expect(
      classifyDraftSchemaVersion(
        'request',
        buildRequest({ formVersion: 1, schemaSnapshot: { ...schemaSnapshot, version: 0 } }),
        activeRequestSchema,
      ),
    ).toBe('newer-or-inconsistent')
    expect(
      classifyDraftSchemaVersion(
        'request',
        buildRequest({
          formVersion: 2,
          schemaSnapshot: activeRequestSchema.schema,
        }),
        activeRequestSchema,
      ),
    ).toBe('equal')
    expect(
      classifyDraftSchemaVersion(
        'request',
        buildRequest({
          formVersion: 3,
          schemaSnapshot: { ...activeRequestSchema.schema, version: 3 },
        }),
        activeRequestSchema,
      ),
    ).toBe('newer-or-inconsistent')
    expect(
      classifyDraftSchemaVersion(
        'request',
        buildRequest({ formVersion: 2, schemaSnapshot }),
        activeRequestSchema,
      ),
    ).toBe('newer-or-inconsistent')
    expect(
      classifyDraftSchemaVersion('preview', buildRequest(), activeRequestSchema),
    ).toBe('not-applicable')
  })

  it('requires a decision only for older Drafts and allows submit only on an equal schema version', () => {
    const isDraftSchemaDecisionRequired = Reflect.get(
      activeSchemaFormState,
      'isDraftSchemaDecisionRequired',
    ) as undefined | ((classification: string) => boolean)
    const canSubmitDraftForSchemaVersion = Reflect.get(
      activeSchemaFormState,
      'canSubmitDraftForSchemaVersion',
    ) as undefined | ((classification: string) => boolean)

    expect(isDraftSchemaDecisionRequired).toBeTypeOf('function')
    expect(canSubmitDraftForSchemaVersion).toBeTypeOf('function')
    if (!isDraftSchemaDecisionRequired || !canSubmitDraftForSchemaVersion) {
      return
    }

    expect(isDraftSchemaDecisionRequired('older')).toBe(true)
    expect(isDraftSchemaDecisionRequired('equal')).toBe(false)
    expect(isDraftSchemaDecisionRequired('newer-or-inconsistent')).toBe(false)
    expect(canSubmitDraftForSchemaVersion('older')).toBe(false)
    expect(canSubmitDraftForSchemaVersion('equal')).toBe(true)
    expect(canSubmitDraftForSchemaVersion('newer-or-inconsistent')).toBe(false)
  })
})

describe('DraftSchemaUpgradeDecision', () => {
  it('admits only one in-flight explicit upgrade mutation at a time', () => {
    const createDraftSchemaUpgradeLock = Reflect.get(
      activeSchemaFormState,
      'createDraftSchemaUpgradeLock',
    ) as
      | undefined
      | (() => { finish: () => void; tryStart: () => boolean })

    expect(createDraftSchemaUpgradeLock).toBeTypeOf('function')
    if (!createDraftSchemaUpgradeLock) {
      return
    }

    const lock = createDraftSchemaUpgradeLock()
    expect(lock.tryStart()).toBe(true)
    expect(lock.tryStart()).toBe(false)
    lock.finish()
    expect(lock.tryStart()).toBe(true)
  })

  it('renders an accessible explicit Upgrade or Remain choice with a recoverable error', () => {
    const DraftSchemaUpgradeDecision = Reflect.get(
      activeSchemaForm,
      'DraftSchemaUpgradeDecision',
    ) as
      | undefined
      | ComponentType<{
        activeVersion: number
        currentVersion: number
        error: string | null
        isUpgradePending: boolean
        onReload: () => void
        onRemain: () => void
        onUpgrade: () => void
      }>

    expect(DraftSchemaUpgradeDecision).toBeTypeOf('function')
    if (!DraftSchemaUpgradeDecision) {
      return
    }

    const html = renderToStaticMarkup(
      <DraftSchemaUpgradeDecision
        activeVersion={2}
        currentVersion={1}
        error="The active schema changed. Reload and retry."
        isUpgradePending={false}
        onReload={() => undefined}
        onRemain={() => undefined}
        onUpgrade={() => undefined}
      />,
    )

    expect(html).toContain('Schema update required')
    expect(html).toContain('Upgrade to version 2')
    expect(html).toContain('Remain on version 1')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Reload draft')
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
