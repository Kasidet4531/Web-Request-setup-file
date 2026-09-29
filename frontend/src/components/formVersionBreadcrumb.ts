import { createContext } from 'react'
import type { FormSchemaVersionResponse } from '../types/forms'

export type FormVersionBreadcrumb = Pick<FormSchemaVersionResponse, 'version' | 'status'> & { dirty: boolean }
export const FormVersionBreadcrumbContext = createContext<(value: FormVersionBreadcrumb | null) => void>(() => {})
