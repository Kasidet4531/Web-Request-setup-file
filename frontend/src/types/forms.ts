export type FormControlType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio'

export const FORM_KEYS = ['psf-request', 'psf-created-information'] as const
export type FormKey = typeof FORM_KEYS[number]

export function isFormKey(value: unknown): value is FormKey {
  return typeof value === 'string' && (FORM_KEYS as readonly string[]).includes(value)
}

export interface FormSchemaField {
  fieldKey: string
  canonicalKey: string
  label: string
  type: FormControlType
  required: boolean
  options?: string[]
  searchable?: boolean
  exportable?: boolean
  autofillTrigger?: boolean
}

export interface FormSchemaSection {
  sectionKey: string
  title: string
  fields: FormSchemaField[]
}

export interface FormSchema {
  formKey: FormKey
  version: number
  title: string
  sections: FormSchemaSection[]
}

export interface ActiveFormSchemaResponse {
  formKey: FormKey
  version: number
  title: string
  description: string | null
  status: string
  schema: FormSchema
  publishedAt: string | null
}

export type FormSchemaStatus = 'active' | 'draft' | 'published'

export type FormSchemaDraft = Omit<FormSchema, 'version'>

export interface FormSchemaVersionResponse {
  formKey: FormKey
  version: number
  title: string
  description: string | null
  status: FormSchemaStatus
  schema: FormSchema
  createdBy: string | null
  createdAt: string
  publishedAt: string | null
}

export interface FormSchemaVersionListResponse {
  formKey: FormKey
  versions: FormSchemaVersionResponse[]
}

export interface SaveFormSchemaDraftPayload {
  draftVersion: number
  description?: string | null
  schema: FormSchemaDraft
}

export interface PublishFormSchemaDraftPayload {
  version: number
}

export type DynamicFormValues = Record<string, string>
export type DynamicFormErrors = Record<string, string>
