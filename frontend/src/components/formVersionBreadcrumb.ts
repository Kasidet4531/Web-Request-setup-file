import { createContext } from 'react'
import type { FormSchemaVersionResponse } from '../types/forms'

export type FormVersionBreadcrumb = Pick<FormSchemaVersionResponse, 'version' | 'status'> & { dirty: boolean }
export const FormVersionBreadcrumbContext = createContext<(value: FormVersionBreadcrumb | null) => void>(() => {})

export function guardUnsavedFormExit(dirty: boolean, event: { preventDefault: () => void }) {
  if (dirty && !window.confirm('Discard unsaved form changes and return to Form management?')) event.preventDefault()
}
