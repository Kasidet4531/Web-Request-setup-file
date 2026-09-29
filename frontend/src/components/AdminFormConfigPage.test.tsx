import type { AnchorHTMLAttributes } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/api'
import type { FormSchemaDraft, FormSchemaVersionResponse } from '../types/forms'
import * as FormConfigRoute from '../routes/admin/form-config'
import * as FormConfigIndexRoute from '../routes/admin/form-config.index'
import * as FormConfigVersionRoute from '../routes/admin/form-config.$version'
import {
  AdminFormConfigFeedback,
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
  readFormSchemaEditorDraft,
  selectInitialFormConfigVersion,
  selectRefreshedFormConfigVersion,
} from './adminFormConfigState'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  Link: ({ to, params, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; params: { version: string } }) =>
    <a {...props} href={to.replace('$version', params.version)} />,
}))

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

  it('keeps incomplete labels editable but hides malformed JSON from the visual editor', () => {
    const incomplete = { ...editableSchema, title: '', sections: [{ ...editableSchema.sections[0], fields: [
      { ...editableSchema.sections[0].fields[0], label: '' },
    ] }] }
    expect(readFormSchemaEditorDraft(JSON.stringify(incomplete))).toEqual(incomplete)
    expect(parseFormSchemaDraft(JSON.stringify(incomplete)).schema).toBeNull()
    expect(readFormSchemaEditorDraft('{')).toBeNull()
    expect(readFormSchemaEditorDraft(JSON.stringify({ ...editableSchema, sections: [{ fields: null }] }))).toBeNull()
    expect(readFormSchemaEditorDraft(JSON.stringify({ ...editableSchema, sections: [{ ...editableSchema.sections[0], fields: [editableSchema.sections[0].fields[0], editableSchema.sections[0].fields[0]] }] }))).toBeNull()
    expect(readFormSchemaEditorDraft(JSON.stringify({ ...editableSchema, sections: [{ ...editableSchema.sections[0], fields: [{ ...editableSchema.sections[0].fields[0], fieldKey: '__proto__' }] }] }))).toBeNull()
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

  it('catches duplicate keys, unsupported visibility, and empty choices before saving or publishing', () => {
    const first = editableSchema.sections[0]
    expect(parseFormSchemaDraft(JSON.stringify({ ...editableSchema, sections: [] })).error).toContain('at least one section')
    expect(parseFormSchemaDraft(JSON.stringify({ ...editableSchema, sections: [{ ...first, fields: [] }] })).error).toContain('at least one field')
    expect(parseFormSchemaDraft(JSON.stringify({ ...editableSchema, sections: [first, first] })).error).toContain('duplicate sectionKey')
    expect(parseFormSchemaDraft(JSON.stringify({ ...editableSchema, sections: [{ ...first, fields: [first.fields[0], first.fields[0]] }] })).error).toContain('duplicate fieldKey')
    expect(parseFormSchemaDraft(JSON.stringify({ ...editableSchema, sections: [{ ...first, visibleTo: ['unknown'] }] })).error).toContain('supported roles')
    expect(parseFormSchemaDraft(JSON.stringify({ ...editableSchema, sections: [{ ...first, fields: [{ ...first.fields[0], options: [''] }, first.fields[1]] }] })).error).toContain('nonblank options')
    expect(parseFormSchemaDraft(JSON.stringify({ ...editableSchema, sections: [{ ...first, fields: [{ ...first.fields[0], options: [] }, first.fields[1]] }] })).error).toContain('at least one option')
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
      draftVersion: 2,
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

  it('lists active and historical versions without destructive actions and creates drafts only when none exists', () => {
    const active = buildVersion({ status: 'active', version: 2 })
    const old = buildVersion({ status: 'published', version: 1 })
    const draft = buildVersion({ status: 'draft', version: 3 })
    const props = { disabled: false, onDuplicate: vi.fn(), onDiscard: vi.fn(), onPublish: vi.fn() }
    const history = renderToStaticMarkup(<AdminFormConfigVersionSelector {...props} versions={[active, old]} />)
    const pending = renderToStaticMarkup(<AdminFormConfigVersionSelector {...props} versions={[draft, active, old]} />)
    expect(history.match(/Duplicate as draft/g)).toHaveLength(2)
    expect(history).toContain('<table')
    expect(history).toContain('<th scope="col">Created</th>')
    expect(history).toContain('<th scope="col">Published</th>')
    expect(history).toContain('Inactive')
    expect(history).not.toContain('Selected')
    expect(history).not.toContain('Discard draft')
    expect(pending).toContain('Duplicate as draft')
    expect(pending).toMatch(/disabled=""[^>]*>Duplicate as draft/)
    expect(pending).toContain('>Discard</button>')
  })

  it('opens versions from the table instead of View or Edit actions', () => {
    const props = { disabled: false, onDuplicate: vi.fn(), onDiscard: vi.fn(), onPublish: vi.fn() }
    const html = renderToStaticMarkup(<AdminFormConfigVersionSelector {...props} versions={[
      buildVersion({ status: 'active', version: 2 }),
      buildVersion({ status: 'draft', version: 3 }),
    ]} />)
    expect(html).toContain('href="/admin/form-config/2"')
    expect(html).toContain('href="/admin/form-config/3"')
    expect(html).not.toMatch(/>(View|Edit)<\/button>/)
  })

  it('renders native version selection and accessible request feedback', () => {
    const draft = buildVersion()
    const selectorHtml = renderToStaticMarkup(
      <AdminFormConfigVersionSelector
        disabled={false}
        onDuplicate={vi.fn()}
        onDiscard={vi.fn()}
        onPublish={vi.fn()}
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

    expect(selectorHtml).toContain('Form versions')
    expect(selectorHtml).toContain('>v2</a></th>')
    expect(selectorHtml).toContain('PSF Request Form')
    expect(selectorHtml).toContain('>—</td>')
    expect(selectorHtml).toContain('>Discard</button>')
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

  it('wires a list and separate version editor beneath the admin form-config route', () => {
    const routeOptions = Reflect.get(FormConfigRoute.Route, 'options') as { component: unknown }
    const indexOptions = Reflect.get(FormConfigIndexRoute.Route, 'options') as { component: unknown }
    const versionOptions = Reflect.get(FormConfigVersionRoute.Route, 'options') as { component: unknown }
    expect(routeOptions.component).toBeDefined()
    expect(indexOptions.component).toBeDefined()
    expect(versionOptions.component).toBeDefined()
  })
})
