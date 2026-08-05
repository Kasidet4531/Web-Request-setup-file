export type FormControlType = 'text' | 'textarea' | 'date' | 'select' | 'radio'

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
  visibleTo: string[]
  fields: FormSchemaField[]
}

export interface FormSchema {
  formKey: string
  version: number
  title: string
  sections: FormSchemaSection[]
}

export interface ActiveFormSchemaResponse {
  formKey: string
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
  formKey: string
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
  formKey: string
  versions: FormSchemaVersionResponse[]
}

export interface SaveFormSchemaDraftPayload {
  description?: string | null
  schema: FormSchemaDraft
}

export interface PublishFormSchemaDraftPayload {
  version: number
}

export type DynamicFormValues = Record<string, string>
export type DynamicFormErrors = Record<string, string>
