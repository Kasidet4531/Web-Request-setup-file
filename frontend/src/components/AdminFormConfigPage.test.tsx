import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/api'
import type { FormSchemaDraft, FormSchemaVersionResponse } from '../types/forms'
import * as FormConfigRoute from '../routes/admin/form-config'
import {
  AdminFormConfigFeedback,
  AdminFormConfigPage,
  AdminFormConfigPreview,
  AdminFormConfigVersionSelector,
} from './AdminFormConfigPage'
import {
  buildAdminFormConfigSavePayload,
  buildPreviewSchema,
  canPublishFormConfig,
  formatFormSchemaDraft,
  getAdminFormConfigErrorMessage,
  parseFormSchemaDraft,
  requiresUnsavedVersionConfirmation,
  selectInitialFormConfigVersion,
  selectRefreshedFormConfigVersion,
} from './adminFormConfigState'

const editableSchema: FormSchemaDraft = {
  formKey: 'psf-request',
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester', 'setup_owner', 'admin'],
      fields: [
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Product Type',
          type: 'radio',
          required: true,
          options: ['New Product', 'Transfer Product'],
        },
        {
          fieldKey: 'request_note',
          canonicalKey: 'request_note',
          label: 'Request note',
          type: 'textarea',
          required: false,
        },
      ],
    },
  ],
}

function buildVersion(overrides: Partial<FormSchemaVersionResponse> = {}): FormSchemaVersionResponse {
  return {
    createdAt: '2026-08-05T00:00:00.000Z',
    createdBy: 'admin.demo',
    description: 'Editable form configuration',
    formKey: 'psf-request',
    publishedAt: null,
    schema: { ...editableSchema, version: 2 },
    status: 'draft',
    title: editableSchema.title,
    version: 2,
    ...overrides,
  }
}

describe('AdminFormConfigPage helpers', () => {
  it('prefers an existing draft, then an active version, then the newest fallback', () => {
    const active = buildVersion({ status: 'active', version: 3 })
    const draft = buildVersion({ status: 'draft', version: 2 })
    const published = buildVersion({ status: 'published', version: 1 })

    expect(selectInitialFormConfigVersion([active, draft, published])).toBe(draft)
    expect(selectInitialFormConfigVersion([active, published])).toBe(active)
    expect(selectInitialFormConfigVersion([published])).toBe(published)
    expect(selectInitialFormConfigVersion([])).toBeNull()
  })

  it('formats only editable schema JSON and validates it before renderer use', () => {
    const text = formatFormSchemaDraft({ ...editableSchema, version: 999 })
    const parsed = parseFormSchemaDraft(text)

    expect(JSON.parse(text)).toEqual(editableSchema)
    expect(parsed.error).toBeNull()
    expect(parsed.schema).toEqual(editableSchema)
  })

  it('reports a parse error and a renderer-protecting shape error without producing a preview schema', () => {
    const invalidJson = parseFormSchemaDraft('{')
    const invalidShape = parseFormSchemaDraft(
      JSON.stringify({
        ...editableSchema,
        sections: [{ ...editableSchema.sections[0], sectionKey: '' }],
      }),
    )

    expect(invalidJson).toMatchObject({ error: expect.stringMatching(/^JSON is invalid:/), schema: null })
    expect(invalidShape).toEqual({ error: 'Section 1 must have a nonblank sectionKey.', schema: null })
  })

  it('rejects prototype-reserved field keys before they can reach the shared live preview', () => {
    const version = buildVersion()
    const parsed = parseFormSchemaDraft(
      JSON.stringify({
        ...editableSchema,
        sections: [
          {
            ...editableSchema.sections[0],
            fields: [{ ...editableSchema.sections[0].fields[0], fieldKey: '__proto__' }],
          },
        ],
      }),
    )
    const previewSchema = parsed.schema ? buildPreviewSchema(parsed.schema, version) : null

    expect(() => renderToStaticMarkup(<AdminFormConfigPreview schema={previewSchema} />)).not.toThrow()
    expect(parsed).toEqual({
      error: 'Field 1 in section 1 must not use the prototype-reserved fieldKey "__proto__".',
      schema: null,
    })
  })

  it('renders the existing DynamicFormRenderer only for a valid local schema preview', () => {
    const version = buildVersion()
    const valid = parseFormSchemaDraft(formatFormSchemaDraft(version.schema))
    const previewSchema = valid.schema ? buildPreviewSchema(valid.schema, version) : null
    const validHtml = renderToStaticMarkup(<AdminFormConfigPreview schema={previewSchema} />)
    const invalidHtml = renderToStaticMarkup(<AdminFormConfigPreview schema={null} />)

    expect(validHtml).toContain('Schema preview')
    expect(validHtml).toContain('PSF Request Form')
    expect(validHtml).toContain('version 2')
    expect(validHtml).toContain('disabled=""')
    expect(invalidHtml).toBe('')
  })

  it('keeps the selected server description while sending only editable schema fields on save', () => {
    const payload = buildAdminFormConfigSavePayload(buildVersion(), editableSchema)

    expect(payload).toEqual({
      description: 'Editable form configuration',
      schema: editableSchema,
    })
    expect(payload.schema).not.toHaveProperty('version')
    expect(payload.schema).not.toHaveProperty('status')
  })

  it('selects the server-refetched draft after save and active version after publish', () => {
    const savedDraft = buildVersion({ status: 'draft', version: 4 })
    const publishedActive = buildVersion({ status: 'active', version: 4 })
    const oldActive = buildVersion({ status: 'published', version: 3 })

    expect(selectRefreshedFormConfigVersion([savedDraft, oldActive], savedDraft)).toBe(savedDraft)
    expect(selectRefreshedFormConfigVersion([publishedActive, oldActive], publishedActive)).toBe(publishedActive)
  })

  it('allows publish only for a server-saved, valid, selected draft with no request in flight', () => {
    const draft = buildVersion()
    const active = buildVersion({ status: 'active' })

    expect(
      canPublishFormConfig({ busy: false, dirty: false, parsedSchema: editableSchema, selectedVersion: draft }),
    ).toBe(true)
    expect(
      canPublishFormConfig({ busy: false, dirty: false, parsedSchema: editableSchema, selectedVersion: active }),
    ).toBe(false)
    expect(
      canPublishFormConfig({ busy: false, dirty: false, parsedSchema: null, selectedVersion: draft }),
    ).toBe(false)
    expect(
      canPublishFormConfig({ busy: false, dirty: true, parsedSchema: editableSchema, selectedVersion: draft }),
    ).toBe(false)
    expect(
      canPublishFormConfig({ busy: true, dirty: false, parsedSchema: editableSchema, selectedVersion: draft }),
    ).toBe(false)
  })

  it('requires an explicit unsaved-change guard before switching away from a selected version', () => {
    expect(requiresUnsavedVersionConfirmation(true, 2, 3)).toBe(true)
    expect(requiresUnsavedVersionConfirmation(true, 2, 2)).toBe(false)
    expect(requiresUnsavedVersionConfirmation(false, 2, 3)).toBe(false)
  })

  it('renders native version selection and accessible request feedback', () => {
    const draft = buildVersion()
    const selectorHtml = renderToStaticMarkup(
      <AdminFormConfigVersionSelector
        disabled={false}
        onSelect={vi.fn()}
        selectedVersion={draft}
        versions={[draft]}
      />,
    )
    const loadingHtml = renderToStaticMarkup(<AdminFormConfigFeedback feedback={null} loading />)
    const successHtml = renderToStaticMarkup(
      <AdminFormConfigFeedback feedback={{ kind: 'success', message: 'Draft saved.' }} loading={false} />,
    )
    const errorHtml = renderToStaticMarkup(
      <AdminFormConfigFeedback feedback={{ kind: 'error', message: 'Only admins can manage form schema configurations.' }} loading={false} />,
    )

    expect(selectorHtml).toContain('<select')
    expect(selectorHtml).toContain('Version 2 · draft · PSF Request Form')
    expect(loadingHtml).toContain('Loading form schema versions…')
    expect(loadingHtml).toContain('role="status"')
    expect(successHtml).toContain('role="status"')
    expect(errorHtml).toContain('role="alert"')
  })

  it('surfaces backend 401 and 403 management failures while naming the server authorization boundary', () => {
    const unauthenticated = getAdminFormConfigErrorMessage(
      new ApiError('Not authenticated', 401, 'Unauthorized', null),
      'Unable to load form configuration.',
    )
    const forbidden = getAdminFormConfigErrorMessage(
      new ApiError('Only admins can manage form schema configurations.', 403, 'Forbidden', null),
      'Unable to load form configuration.',
    )

    expect(unauthenticated).toContain('Sign in is required')
    expect(forbidden).toContain('do not have permission')
    expect(unauthenticated).toContain('server enforces administrator authorization')
    expect(forbidden).toContain('Only admins can manage form schema configurations.')
  })

  it('wires only the admin form-config route to the dedicated page', () => {
    const routeOptions = Reflect.get(FormConfigRoute.Route, 'options') as { component: unknown }
    const html = renderToStaticMarkup(createElement(AdminFormConfigPage))

    expect(routeOptions.component).toBe(AdminFormConfigPage)
    expect(html).toContain('<h1>Form configuration</h1>')
  })
})
