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

export type DynamicFormValues = Record<string, string>
export type DynamicFormErrors = Record<string, string>
