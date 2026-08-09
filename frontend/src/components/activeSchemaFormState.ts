import type { PsfRequestResponse } from '../services/api'
import type { ActiveFormSchemaResponse, DynamicFormValues, FormSchema } from '../types/forms'

export const DRAFT_STATUS = 'Draft'

function buildInitialValues(schema: FormSchema): DynamicFormValues {
  return schema.sections.reduce<DynamicFormValues>((values, section) => {
    section.fields.forEach((field) => {
      values[field.fieldKey] = ''
    })

    return values
  }, {})
}

function fieldKeysForSchema(schema: FormSchema): Set<string> {
  return new Set(
    schema.sections.flatMap((section) => section.fields.map((field) => field.fieldKey)),
  )
}

export function buildRequestValuesForSchema(
  schema: FormSchema,
  requesterData: DynamicFormValues,
): DynamicFormValues {
  const initialValues = buildInitialValues(schema)
  const allowedFieldKeys = fieldKeysForSchema(schema)

  Object.entries(requesterData).forEach(([fieldKey, value]) => {
    if (allowedFieldKeys.has(fieldKey)) {
      initialValues[fieldKey] = value
    }
  })

  return initialValues
}

export function activeSchemaFromRequest(request: PsfRequestResponse): ActiveFormSchemaResponse {
  return {
    formKey: request.formKey,
    version: request.formVersion,
    title: request.schemaSnapshot.title,
    description: null,
    status: 'snapshot',
    schema: request.schemaSnapshot,
    publishedAt: null,
  }
}

export type DraftSchemaVersionClassification =
  | 'not-applicable'
  | 'older'
  | 'equal'
  | 'newer-or-inconsistent'

export function classifyDraftSchemaVersion(
  mode: 'request' | 'preview',
  request: PsfRequestResponse,
  activeRequestSchema: ActiveFormSchemaResponse | null,
): DraftSchemaVersionClassification {
  if (
    mode !== 'request' ||
    request.status !== DRAFT_STATUS ||
    activeRequestSchema === null
  ) {
    return 'not-applicable'
  }

  if (
    request.schemaSnapshot.formKey !== request.formKey ||
    request.schemaSnapshot.version !== request.formVersion
  ) {
    return 'newer-or-inconsistent'
  }

  if (request.formVersion < activeRequestSchema.version) {
    return 'older'
  }

  if (request.formVersion === activeRequestSchema.version) {
    return 'equal'
  }

  return 'newer-or-inconsistent'
}

export function isDraftSchemaDecisionRequired(
  classification: DraftSchemaVersionClassification,
): boolean {
  return classification === 'older'
}

export function canSubmitDraftForSchemaVersion(
  classification: DraftSchemaVersionClassification,
): boolean {
  return classification === 'equal'
}

export interface DraftSchemaUpgradeLock {
  finish: () => void
  tryStart: () => boolean
}

export function createDraftSchemaUpgradeLock(): DraftSchemaUpgradeLock {
  let inFlight = false

  return {
    tryStart: () => {
      if (inFlight) {
        return false
      }

      inFlight = true
      return true
    },
    finish: () => {
      inFlight = false
    },
  }
}

export function resolveRequestFormSchema(
  mode: 'request' | 'preview',
  request: PsfRequestResponse,
  activeRequestSchema: ActiveFormSchemaResponse | null,
): ActiveFormSchemaResponse {
  if (
    classifyDraftSchemaVersion(mode, request, activeRequestSchema) === 'equal' &&
    activeRequestSchema
  ) {
    return activeRequestSchema
  }

  return activeSchemaFromRequest(request)
}

export function requesterFieldsAreReadOnly(
  mode: 'request' | 'preview',
  request: PsfRequestResponse | null,
): boolean {
  return mode === 'preview' || (request !== null && request.status !== DRAFT_STATUS)
}
