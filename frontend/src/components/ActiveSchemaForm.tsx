import { useEffect, useMemo, useState } from 'react'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import {
  activeSchemaFromRequest,
  buildRequestValuesForSchema,
  DRAFT_STATUS,
  requesterFieldsAreReadOnly,
  resolveRequestFormSchema,
} from './activeSchemaFormState'
import { api, type PsfRequestResponse } from '../services/api'
import { validateRequiredFields } from '../services/formValidation'
import type { ActiveFormSchemaResponse, DynamicFormErrors, DynamicFormValues, FormSchema } from '../types/forms'

const PSF_REQUEST_FORM_KEY = 'psf-request'

function buildInitialValues(schema: FormSchema): DynamicFormValues {
  return schema.sections.reduce<DynamicFormValues>((values, section) => {
    section.fields.forEach((field) => {
      values[field.fieldKey] = ''
    })

    return values
  }, {})
}

export interface ActiveSchemaFormProps {
  mode: 'request' | 'preview'
  requestId?: string
}

export interface RequestDraftStatusProps {
  request: PsfRequestResponse
}

export function RequestDraftStatus({ request }: RequestDraftStatusProps) {
  const requestPath = `/requests/${encodeURIComponent(request.id)}/`
  const requestLinkLabel = request.status === DRAFT_STATUS ? 'Open saved draft' : 'Open request details'

  return (
    <p className="page-card__description">
      {request.requestNo} · {request.status} · <a href={requestPath}>{requestLinkLabel}</a>
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
  const [submitting, setSubmitting] = useState(false)
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

          const requestSchema =
            mode === 'request' && request.status === DRAFT_STATUS
              ? await api.fetchActiveFormSchema(request.formKey)
              : null

          if (!mounted) {
            return
          }

          const resolvedSchema = resolveRequestFormSchema(mode, request, requestSchema)
          setCurrentRequest(request)
          setActiveSchema(resolvedSchema)
          setValues(buildRequestValuesForSchema(resolvedSchema.schema, request.requesterData))
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
  }, [mode, requestId])

  const readOnly = requesterFieldsAreReadOnly(mode, currentRequest)
  const canSubmitDraft = mode === 'request' && currentRequest?.status === DRAFT_STATUS

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
      const resolvedSchema =
        currentRequest && activeSchema
          ? resolveRequestFormSchema(mode, savedRequest, activeSchema)
          : activeSchemaFromRequest(savedRequest)
      setActiveSchema(resolvedSchema)
      setValues(buildRequestValuesForSchema(resolvedSchema.schema, savedRequest.requesterData))
      setSaveMessage(`Draft ${savedRequest.requestNo} saved.`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save draft request')
    } finally {
      setSaving(false)
    }
  }

  async function submitDraft() {
    if (!activeSchema || !currentRequest || !canSubmitDraft || readOnly) {
      return
    }

    setSubmitting(true)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const latestActiveSchema = await api.fetchActiveFormSchema(currentRequest.formKey)
      const nextRequesterData = buildRequestValuesForSchema(latestActiveSchema.schema, values)
      const nextErrors = validateRequiredFields(latestActiveSchema.schema, nextRequesterData)

      setActiveSchema(latestActiveSchema)
      setValues(nextRequesterData)
      setErrors(nextErrors)

      if (Object.keys(nextErrors).length > 0) {
        return
      }

      const savedRequesterData = buildRequestValuesForSchema(
        latestActiveSchema.schema,
        currentRequest.requesterData,
      )
      const hasUnsavedChanges =
        JSON.stringify(savedRequesterData) !== JSON.stringify(nextRequesterData)
      const readyToSubmit = hasUnsavedChanges
        ? await api.updateDraftRequesterData(currentRequest.id, { requesterData: nextRequesterData })
        : currentRequest
      const submittedRequest = await api.submitPsfRequest(readyToSubmit.id, {
        formVersion: latestActiveSchema.version,
      })

      setCurrentRequest(submittedRequest)
      setActiveSchema(activeSchemaFromRequest(submittedRequest))
      setValues(buildRequestValuesForSchema(submittedRequest.schemaSnapshot, submittedRequest.requesterData))
      setSaveMessage(`Request ${submittedRequest.requestNo} submitted.`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to submit request')
    } finally {
      setSubmitting(false)
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
        readOnly={readOnly || saving || submitting}
        schema={activeSchema.schema}
        submitLabel={saving ? 'Saving draft…' : submitLabel}
        values={values}
      />
      {canSubmitDraft ? (
        <div className="dynamic-form__actions">
          <button className="secondary-button" disabled={saving || submitting} onClick={() => void submitDraft()} type="button">
            {submitting ? 'Submitting request…' : 'Submit request'}
          </button>
        </div>
      ) : null}
    </>
  )
}
