import { useEffect, useMemo, useState } from 'react'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { api } from '../services/api'
import { validateRequiredFields } from '../services/formValidation'
import type { ActiveFormSchemaResponse, DynamicFormErrors, DynamicFormValues, FormSchema } from '../types/forms'

const PSF_REQUEST_FORM_KEY = 'psf-request'

export interface ActiveSchemaFormProps {
  mode: 'request' | 'preview'
}

function buildInitialValues(schema: FormSchema): DynamicFormValues {
  return schema.sections.reduce<DynamicFormValues>((values, section) => {
    section.fields.forEach((field) => {
      values[field.fieldKey] = ''
    })

    return values
  }, {})
}

export function ActiveSchemaForm({ mode }: ActiveSchemaFormProps) {
  const [activeSchema, setActiveSchema] = useState<ActiveFormSchemaResponse | null>(null)
  const [errors, setErrors] = useState<DynamicFormErrors>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [values, setValues] = useState<DynamicFormValues>({})

  useEffect(() => {
    let mounted = true

    async function loadSchema() {
      try {
        const response = await api.fetchActiveFormSchema(PSF_REQUEST_FORM_KEY)

        if (!mounted) {
          return
        }

        setActiveSchema(response)
        setValues(buildInitialValues(response.schema))
      } catch (error) {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load active form schema')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadSchema()

    return () => {
      mounted = false
    }
  }, [])

  const submitLabel = useMemo(
    () => (mode === 'request' ? 'Validate request details' : 'Preview only'),
    [mode],
  )

  function updateField(fieldKey: string, value: string) {
    setValues((currentValues) => ({ ...currentValues, [fieldKey]: value }))
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      delete nextErrors[fieldKey]
      return nextErrors
    })
  }

  function validateBeforeSubmit(currentValues: DynamicFormValues) {
    if (!activeSchema) {
      return
    }

    setErrors(validateRequiredFields(activeSchema.schema, currentValues))
  }

  if (loading) {
    return <p className="page-card__description">Loading active PSF request schema…</p>
  }

  if (loadError || !activeSchema) {
    return (
      <p className="status-pill status-pill--error" role="alert">
        {loadError ?? 'Active PSF request schema is unavailable.'}
      </p>
    )
  }

  return (
    <DynamicFormRenderer
      errors={errors}
      onChange={mode === 'request' ? updateField : undefined}
      onSubmit={mode === 'request' ? validateBeforeSubmit : undefined}
      readOnly={mode === 'preview'}
      schema={activeSchema.schema}
      submitLabel={submitLabel}
      values={values}
    />
  )
}
