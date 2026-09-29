import { ApiError } from '../services/api'
import type {
  FormControlType,
  FormSchema,
  FormSchemaDraft,
  FormSchemaVersionResponse,
  SaveFormSchemaDraftPayload,
} from '../types/forms'

const PSF_REQUEST_FORM_KEY = 'psf-request'
const SUPPORTED_FORM_CONTROL_TYPES = new Set<FormControlType>(['text', 'textarea', 'date', 'select', 'radio'])
const SUPPORTED_VISIBLE_TO = new Set(['requester', 'setup_owner', 'admin'])

export interface FormSchemaDraftParseResult {
  error: string | null
  schema: FormSchemaDraft | null
}

export interface FormConfigPublishState {
  busy: boolean
  dirty: boolean
  parsedSchema: FormSchemaDraft | null
  selectedVersion: FormSchemaVersionResponse | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonblankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRendererSafeFieldKey(value: string): boolean {
  return !Object.prototype.hasOwnProperty.call(Object.prototype, value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validateField(field: unknown, sectionIndex: number, fieldIndex: number): string | null {
  const fieldPrefix = `Field ${fieldIndex + 1} in section ${sectionIndex + 1}`

  if (!isRecord(field)) {
    return `${fieldPrefix} must be an object.`
  }

  if (!isNonblankString(field.fieldKey)) {
    return `${fieldPrefix} must have a nonblank fieldKey.`
  }

  if (!isRendererSafeFieldKey(field.fieldKey)) {
    return `${fieldPrefix} must not use the prototype-reserved fieldKey "${field.fieldKey}".`
  }

  if (!isNonblankString(field.canonicalKey)) {
    return `${fieldPrefix} must have a nonblank canonicalKey.`
  }

  if (!isNonblankString(field.label)) {
    return `${fieldPrefix} must have a nonblank label.`
  }

  if (typeof field.type !== 'string' || !SUPPORTED_FORM_CONTROL_TYPES.has(field.type as FormControlType)) {
    return `${fieldPrefix} must use a supported field type.`
  }

  if (typeof field.required !== 'boolean') {
    return `${fieldPrefix} must declare required as true or false.`
  }

  if ((field.type === 'select' || field.type === 'radio') && !isStringArray(field.options)) {
    return `${fieldPrefix} must provide string options for ${field.type} controls.`
  }

  if ((field.type === 'select' || field.type === 'radio') && isStringArray(field.options)) {
    if (field.options.length === 0) return `${fieldPrefix} must have at least one option.`
    if (field.options.some((option) => !option.trim())) return `${fieldPrefix} must have nonblank options.`
  }

  if (field.options !== undefined && !isStringArray(field.options)) {
    return `${fieldPrefix} options must be an array of strings.`
  }

  return null
}

function validateSection(section: unknown, sectionIndex: number): string | null {
  if (!isRecord(section)) {
    return `Section ${sectionIndex + 1} must be an object.`
  }

  if (!isNonblankString(section.sectionKey)) {
    return `Section ${sectionIndex + 1} must have a nonblank sectionKey.`
  }

  if (!isNonblankString(section.title)) {
    return `Section ${sectionIndex + 1} must have a nonblank title.`
  }

  if (!isStringArray(section.visibleTo)) {
    return `Section ${sectionIndex + 1} visibleTo must be an array of strings.`
  }

  if (section.visibleTo.length === 0 || section.visibleTo.some((role) => !SUPPORTED_VISIBLE_TO.has(role))) {
    return `Section ${sectionIndex + 1} visibleTo must use supported roles.`
  }

  if (!Array.isArray(section.fields)) {
    return `Section ${sectionIndex + 1} fields must be an array.`
  }

  for (const [fieldIndex, field] of section.fields.entries()) {
    const error = validateField(field, sectionIndex, fieldIndex)
    if (error) {
      return error
    }
  }

  return null
}

function toFormSchemaDraft(schema: FormSchema | FormSchemaDraft): FormSchemaDraft {
  return {
    formKey: schema.formKey,
    title: schema.title,
    sections: schema.sections,
  }
}

export function formatFormSchemaDraft(schema: FormSchema | FormSchemaDraft): string {
  return JSON.stringify(toFormSchemaDraft(schema), null, 2)
}

export function readFormSchemaEditorDraft(text: string): FormSchemaDraft | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (
    !isRecord(value) || value.formKey !== PSF_REQUEST_FORM_KEY ||
    typeof value.title !== 'string' || !Array.isArray(value.sections)
  ) return null

  const sectionKeys = new Set<string>()
  const fieldKeys = new Set<string>()
  for (const section of value.sections) {
    if (
      !isRecord(section) || typeof section.sectionKey !== 'string' ||
      typeof section.title !== 'string' || !isStringArray(section.visibleTo) ||
      !Array.isArray(section.fields)
    ) return null
    if (!section.sectionKey.trim() || sectionKeys.has(section.sectionKey)) return null
    sectionKeys.add(section.sectionKey)

    for (const field of section.fields) {
      if (
        !isRecord(field) || typeof field.fieldKey !== 'string' ||
        typeof field.canonicalKey !== 'string' || typeof field.label !== 'string' ||
        typeof field.type !== 'string' || !SUPPORTED_FORM_CONTROL_TYPES.has(field.type as FormControlType) ||
        typeof field.required !== 'boolean' ||
        (field.options !== undefined && !isStringArray(field.options))
      ) return null
      if (!field.fieldKey.trim() || !isRendererSafeFieldKey(field.fieldKey) || fieldKeys.has(field.fieldKey)) return null
      fieldKeys.add(field.fieldKey)
    }
  }

  return value as unknown as FormSchemaDraft
}

export function parseFormSchemaDraft(text: string): FormSchemaDraftParseResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      error: `JSON is invalid: ${error instanceof Error ? error.message : 'Unknown parse error.'}`,
      schema: null,
    }
  }

  if (!isRecord(parsed)) {
    return { error: 'Schema JSON must be an object.', schema: null }
  }

  if (parsed.formKey !== PSF_REQUEST_FORM_KEY) {
    return { error: `Schema formKey must be exactly "${PSF_REQUEST_FORM_KEY}".`, schema: null }
  }

  if (!isNonblankString(parsed.title)) {
    return { error: 'Schema title must be nonblank.', schema: null }
  }

  if (!Array.isArray(parsed.sections)) {
    return { error: 'Schema sections must be an array.', schema: null }
  }
  if (parsed.sections.length === 0) {
    return { error: 'Schema must have at least one section.', schema: null }
  }

  const sectionKeys = new Set<string>()
  const fieldKeys = new Set<string>()
  for (const [sectionIndex, section] of parsed.sections.entries()) {
    const error = validateSection(section, sectionIndex)
    if (error) {
      return { error, schema: null }
    }
    const typedSection = section as FormSchemaDraft['sections'][number]
    if (sectionKeys.has(typedSection.sectionKey)) {
      return { error: `Section ${sectionIndex + 1} has a duplicate sectionKey "${typedSection.sectionKey}".`, schema: null }
    }
    sectionKeys.add(typedSection.sectionKey)
    for (const field of typedSection.fields) {
      if (fieldKeys.has(field.fieldKey)) {
        return { error: `Field "${field.fieldKey}" has a duplicate fieldKey.`, schema: null }
      }
      fieldKeys.add(field.fieldKey)
    }
  }
  if (fieldKeys.size === 0) {
    return { error: 'Schema must have at least one field.', schema: null }
  }

  return {
    error: null,
    schema: {
      formKey: PSF_REQUEST_FORM_KEY,
      title: parsed.title,
      sections: parsed.sections as FormSchemaDraft['sections'],
    },
  }
}

export function selectInitialFormConfigVersion(
  versions: FormSchemaVersionResponse[],
): FormSchemaVersionResponse | null {
  return versions.find((version) => version.status === 'draft')
    ?? versions.find((version) => version.status === 'active')
    ?? versions[0]
    ?? null
}

export function selectRefreshedFormConfigVersion(
  versions: FormSchemaVersionResponse[],
  serverVersion: FormSchemaVersionResponse,
): FormSchemaVersionResponse {
  return versions.find(
    (version) => version.version === serverVersion.version && version.status === serverVersion.status,
  ) ?? versions.find((version) => version.version === serverVersion.version)
    ?? serverVersion
}

export function buildPreviewSchema(
  schema: FormSchemaDraft,
  selectedVersion: FormSchemaVersionResponse,
): FormSchema {
  return {
    formKey: selectedVersion.formKey,
    version: selectedVersion.version,
    title: schema.title,
    sections: schema.sections,
  }
}

export function buildAdminFormConfigSavePayload(
  selectedVersion: FormSchemaVersionResponse,
  schema: FormSchemaDraft,
): SaveFormSchemaDraftPayload {
  return {
    draftVersion: selectedVersion.version,
    description: selectedVersion.description,
    schema: toFormSchemaDraft(schema),
  }
}

export function canPublishFormConfig({
  busy,
  dirty,
  parsedSchema,
  selectedVersion,
}: FormConfigPublishState): boolean {
  return !busy && !dirty && parsedSchema !== null && selectedVersion?.status === 'draft'
}

export function getAdminFormConfigErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback

  if (error instanceof ApiError && error.status === 401) {
    return `Sign in is required to manage form configuration. The server enforces administrator authorization. ${message}`
  }

  if (error instanceof ApiError && error.status === 403) {
    return `You do not have permission to manage form configuration. The server enforces administrator authorization. ${message}`
  }

  return message
}
