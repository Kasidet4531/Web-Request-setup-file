import { createContext } from 'react'
import type { FormKey, FormSchemaVersionResponse } from '../types/forms'

export type FormVersionBreadcrumb = Pick<FormSchemaVersionResponse, 'version' | 'status'> & { formKey: FormKey; dirty: boolean }
export const FormVersionBreadcrumbContext = createContext<(value: FormVersionBreadcrumb | null) => void>(() => {})
