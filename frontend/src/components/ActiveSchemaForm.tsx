import { useEffect, useMemo, useState } from 'react'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { api, type PsfRequestResponse } from '../services/api'
import { validateRequiredFields } from '../services/formValidation'
import type { ActiveFormSchemaResponse, DynamicFormErrors, DynamicFormValues, FormSchema } from '../types/forms'

const PSF_REQUEST_FORM_KEY = 'psf-request'
const DRAFT_STATUS = 'Draft'

export interface ActiveSchemaFormProps {
  mode: 'request' | 'preview'
  requestId?: string
}

function buildInitialValues(schema: FormSchema): DynamicFormValues {
  return schema.sections.reduce<DynamicFormValues>((values, section) => {
    section.fields.forEach((field) => {
      values[field.fieldKey] = ''
    })

    return values
  }, {})
}

function activeSchemaFromRequest(request: PsfRequestResponse): ActiveFormSchemaResponse {
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

export interface RequestDraftStatusProps {
  request: PsfRequestResponse
}

export function RequestDraftStatus({ request }: RequestDraftStatusProps) {
  const requestPath = `/requests/${encodeURIComponent(request.id)}/`

  return (
    <p className="page-card__description">
      {request.requestNo} · {request.status} ·{' '}
      <a href={requestPath}>Open saved draft</a>
      {request.status !== DRAFT_STATUS ? ' · requester-owned fields are locked after Draft status.' : null}
    </p>
  )
}

export function ActiveSchemaForm({ mode, requestId }: ActiveSchemaFormProps) {
  const [activeSchema, setActiveSchema] = useState<ActiveFormSchemaResponse | null>(null)
  const [currentRequest, setCurrentRequest] = useState<PsfRequestResponse | null>(null)
  const [errors, setErrors] = useState<DynamicFormErrors>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [values, setValues] = useState<DynamicFormValues>({})

  useEffect(() => {
    let mounted = true

    async function loadSchemaOrRequest() {
      try {
        if (requestId) {
          const request = await api.fetchPsfRequest(requestId)

          if (!mounted) {
            return
          }

          setCurrentRequest(request)
          setActiveSchema(activeSchemaFromRequest(request))
          setValues({ ...buildInitialValues(request.schemaSnapshot), ...request.requesterData })
          return
        }

        const response = await api.fetchActiveFormSchema(PSF_REQUEST_FORM_KEY)

        if (!mounted) {
          return
        }

        setActiveSchema(response)
        setValues(buildInitialValues(response.schema))
      } catch (error) {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load PSF request draft')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadSchemaOrRequest()

    return () => {
      mounted = false
    }
  }, [requestId])

  const readOnly = mode === 'preview' || (currentRequest !== null && currentRequest.status !== DRAFT_STATUS)

  const submitLabel = useMemo(() => {
    if (currentRequest) {
      return currentRequest.status === DRAFT_STATUS ? 'Save draft changes' : 'Requester edits locked'
    }

    return mode === 'request' ? 'Save draft request' : 'Preview only'
  }, [currentRequest, mode])

  function updateField(fieldKey: string, value: string) {
    setValues((currentValues) => ({ ...currentValues, [fieldKey]: value }))
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      delete nextErrors[fieldKey]
      return nextErrors
    })
    setSaveError(null)
    setSaveMessage(null)
  }

  async function saveDraft(currentValues: DynamicFormValues) {
    if (!activeSchema || readOnly) {
      return
    }

    const nextErrors = validateRequiredFields(activeSchema.schema, currentValues)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const savedRequest = currentRequest
        ? await api.updateDraftRequesterData(currentRequest.id, { requesterData: currentValues })
        : await api.createDraftRequest({ requesterData: currentValues })

      setCurrentRequest(savedRequest)
      setActiveSchema(activeSchemaFromRequest(savedRequest))
      setValues({ ...buildInitialValues(savedRequest.schemaSnapshot), ...savedRequest.requesterData })
      setSaveMessage(`Draft ${savedRequest.requestNo} saved.`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save draft request')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="page-card__description">Loading PSF request draft…</p>
  }

  if (loadError || !activeSchema) {
    return (
      <p className="status-pill status-pill--error" role="alert">
        {loadError ?? 'PSF request draft is unavailable.'}
      </p>
    )
  }

  return (
    <>
      {currentRequest ? <RequestDraftStatus request={currentRequest} /> : null}
      {saveMessage ? (
        <p className="status-pill status-pill--success" role="status">
          {saveMessage}
        </p>
      ) : null}
      {saveError ? (
        <p className="status-pill status-pill--error" role="alert">
          {saveError}
        </p>
      ) : null}
      <DynamicFormRenderer
        errors={errors}
        onChange={!readOnly ? updateField : undefined}
        onSubmit={!readOnly ? saveDraft : undefined}
        readOnly={readOnly || saving}
        schema={activeSchema.schema}
        submitLabel={saving ? 'Saving draft…' : submitLabel}
        values={values}
      />
    </>
  )
}
