import { useEffect, useMemo, useRef, useState } from 'react'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import {
  activeSchemaFromRequest,
  buildRequestValuesForSchema,
  canSubmitDraftForSchemaVersion,
  classifyDraftSchemaVersion,
  createDraftSchemaUpgradeLock,
  DRAFT_STATUS,
  type DraftSchemaVersionClassification,
  isDraftSchemaDecisionRequired,
  requesterFieldsAreReadOnly,
  resolveRequestFormSchema,
} from './activeSchemaFormState'
import { api, type PsfRequestResponse } from '../services/api'
import { validateRequiredFields } from '../services/formValidation'
import type {
  ActiveFormSchemaResponse,
  DynamicFormErrors,
  DynamicFormValues,
  FormSchema,
} from '../types/forms'

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

export interface DraftSchemaUpgradeDecisionProps {
  activeVersion: number
  currentVersion: number
  error: string | null
  hasRemained?: boolean
  isUpgradePending: boolean
  onReload: () => void
  onRemain: () => void
  onUpgrade: () => void
  showRemain?: boolean
}

export function DraftSchemaUpgradeDecision({
  activeVersion,
  currentVersion,
  error,
  hasRemained = false,
  isUpgradePending,
  onReload,
  onRemain,
  onUpgrade,
  showRemain = true,
}: DraftSchemaUpgradeDecisionProps) {
  return (
    <section
      aria-busy={isUpgradePending}
      aria-labelledby="draft-schema-upgrade-heading"
      className="draft-schema-upgrade"
    >
      <h2 id="draft-schema-upgrade-heading">
        {hasRemained ? 'Schema upgrade required before submit' : 'Schema update required'}
      </h2>
      <p>
        This Draft uses schema version {currentVersion}; the active request schema is version {activeVersion}.
        {' '}
        {hasRemained
          ? 'You can keep editing this version, but Upgrade is required before submitting.'
          : 'Choose whether to upgrade now or remain on the Draft schema while editing.'}
      </p>
      {isUpgradePending ? <p role="status">Upgrading Draft schema…</p> : null}
      {error ? (
        <p className="status-pill status-pill--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="draft-schema-upgrade__actions">
        <button
          className="primary-button"
          disabled={isUpgradePending}
          onClick={onUpgrade}
          type="button"
        >
          {isUpgradePending ? 'Upgrading schema…' : `Upgrade to version ${activeVersion}`}
        </button>
        {showRemain ? (
          <button
            className="secondary-button"
            disabled={isUpgradePending}
            onClick={onRemain}
            type="button"
          >
            Remain on version {currentVersion}
          </button>
        ) : null}
        {error ? (
          <button
            className="secondary-button"
            disabled={isUpgradePending}
            onClick={onReload}
            type="button"
          >
            Reload draft
          </button>
        ) : null}
      </div>
    </section>
  )
}

type DraftSchemaDecision = 'not-needed' | 'remain' | 'unresolved'

export function ActiveSchemaForm({ mode, requestId }: ActiveSchemaFormProps) {
  const [activeSchema, setActiveSchema] = useState<ActiveFormSchemaResponse | null>(null)
  const [activeRequestSchema, setActiveRequestSchema] = useState<ActiveFormSchemaResponse | null>(null)
  const [currentRequest, setCurrentRequest] = useState<PsfRequestResponse | null>(null)
  const [draftSchemaDecision, setDraftSchemaDecision] = useState<DraftSchemaDecision>('not-needed')
  const [draftSchemaVersion, setDraftSchemaVersion] = useState<DraftSchemaVersionClassification>('not-applicable')
  const [errors, setErrors] = useState<DynamicFormErrors>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadedSchemaKey, setLoadedSchemaKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [upgradePending, setUpgradePending] = useState(false)
  const [values, setValues] = useState<DynamicFormValues>({})
  const draftSchemaUpgradeLock = useRef(createDraftSchemaUpgradeLock())
  const loadKey = `${mode}:${requestId ?? 'new'}:${reloadKey}`

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

          const classification = classifyDraftSchemaVersion(mode, request, requestSchema)
          const resolvedSchema = resolveRequestFormSchema(mode, request, requestSchema)
          setLoadError(null)
          setSaveError(null)
          setSaveMessage(null)
          setUpgradeError(null)
          setErrors({})
          setCurrentRequest(request)
          setActiveRequestSchema(requestSchema)
          setActiveSchema(resolvedSchema)
          setDraftSchemaVersion(classification)
          setDraftSchemaDecision(
            isDraftSchemaDecisionRequired(classification) ? 'unresolved' : 'not-needed',
          )
          setValues(buildRequestValuesForSchema(resolvedSchema.schema, request.requesterData))
          return
        }

        const response = await api.fetchActiveFormSchema(PSF_REQUEST_FORM_KEY)

        if (!mounted) {
          return
        }

        setLoadError(null)
        setSaveError(null)
        setSaveMessage(null)
        setUpgradeError(null)
        setErrors({})
        setCurrentRequest(null)
        setActiveRequestSchema(null)
        setDraftSchemaDecision('not-needed')
        setDraftSchemaVersion('not-applicable')
        setActiveSchema(response)
        setValues(buildInitialValues(response.schema))
      } catch (error) {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load PSF request draft')
        }
      } finally {
        if (mounted) {
          setLoadedSchemaKey(loadKey)
          setLoading(false)
        }
      }
    }

    void loadSchemaOrRequest()

    return () => {
      mounted = false
    }
  }, [loadKey, mode, requestId])

  const schemaDecisionRequired = isDraftSchemaDecisionRequired(draftSchemaVersion)
  const isSchemaChoicePending = schemaDecisionRequired && draftSchemaDecision === 'unresolved'
  const hasInconsistentDraftSchema = draftSchemaVersion === 'newer-or-inconsistent'
  const readOnly = requesterFieldsAreReadOnly(mode, currentRequest)
  const formReadOnly = readOnly || saving || submitting || upgradePending || hasInconsistentDraftSchema
  const canSubmitDraft =
    mode === 'request' &&
    currentRequest?.status === DRAFT_STATUS &&
    !isSchemaChoicePending &&
    canSubmitDraftForSchemaVersion(draftSchemaVersion)
  const submitIsBlockedBySchema =
    mode === 'request' &&
    currentRequest?.status === DRAFT_STATUS &&
    !isSchemaChoicePending &&
    !canSubmitDraftForSchemaVersion(draftSchemaVersion)

  const submitLabel = useMemo(() => {
    if (currentRequest) {
      return currentRequest.status === DRAFT_STATUS ? 'Save draft changes' : 'Requester edits locked'
    }

    return mode === 'request' ? 'Save draft request' : 'Preview only'
  }, [currentRequest, mode])

  const schemaSubmissionMessage = useMemo(() => {
    if (!currentRequest || currentRequest.status !== DRAFT_STATUS) {
      return null
    }

    if (draftSchemaVersion === 'older') {
      return `Schema version ${currentRequest.formVersion} is still editable, but Upgrade to version ${activeRequestSchema?.version ?? 'the active version'} is required before submitting.`
    }

    if (draftSchemaVersion === 'newer-or-inconsistent') {
      return 'This Draft schema does not match the active schema. Its values remain unchanged, but it cannot be submitted until the mismatch is resolved.'
    }

    return null
  }, [activeRequestSchema?.version, currentRequest, draftSchemaVersion])

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

  function remainOnDraftSchema() {
    setDraftSchemaDecision('remain')
    setUpgradeError(null)
    setSaveError(null)
    setSaveMessage(null)
  }

  function reloadDraftSchema() {
    setUpgradeError(null)
    setReloadKey((currentReloadKey) => currentReloadKey + 1)
  }

  async function saveDraft(currentValues: DynamicFormValues) {
    if (!activeSchema || formReadOnly || isSchemaChoicePending) {
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
        ? await api.updateDraftRequesterData(currentRequest.id, {
            formVersion: currentRequest.formVersion,
            requesterData: currentValues,
          })
        : await api.createDraftRequest({ requesterData: currentValues })
      const nextActiveRequestSchema =
        currentRequest && activeRequestSchema
          ? activeRequestSchema
          : activeSchemaFromRequest(savedRequest)
      const classification = classifyDraftSchemaVersion(mode, savedRequest, nextActiveRequestSchema)
      const resolvedSchema = resolveRequestFormSchema(mode, savedRequest, nextActiveRequestSchema)

      setCurrentRequest(savedRequest)
      setActiveRequestSchema(nextActiveRequestSchema)
      setActiveSchema(resolvedSchema)
      setDraftSchemaVersion(classification)
      setDraftSchemaDecision(
        isDraftSchemaDecisionRequired(classification) ? 'remain' : 'not-needed',
      )
      setValues(buildRequestValuesForSchema(resolvedSchema.schema, savedRequest.requesterData))
      setSaveMessage(`Draft ${savedRequest.requestNo} saved.`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save draft request')
    } finally {
      setSaving(false)
    }
  }

  async function upgradeDraftSchema() {
    if (
      !currentRequest ||
      !activeRequestSchema ||
      !schemaDecisionRequired
    ) {
      return
    }

    const upgradeLock = draftSchemaUpgradeLock.current
    if (!upgradeLock.tryStart()) {
      return
    }

    setUpgradePending(true)
    setUpgradeError(null)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const upgradedRequest = await api.upgradeDraftSchema(currentRequest.id, {
        formVersion: activeRequestSchema.version,
      })
      const upgradedSchema = activeSchemaFromRequest(upgradedRequest)
      const classification = classifyDraftSchemaVersion('request', upgradedRequest, upgradedSchema)

      setCurrentRequest(upgradedRequest)
      setActiveRequestSchema(upgradedSchema)
      setActiveSchema(upgradedSchema)
      setDraftSchemaVersion(classification)
      setDraftSchemaDecision('not-needed')
      setErrors({})
      setValues(buildRequestValuesForSchema(upgradedSchema.schema, upgradedRequest.requesterData))
      setSaveMessage(
        `Draft ${upgradedRequest.requestNo} upgraded to schema version ${upgradedRequest.formVersion}.`,
      )
    } catch (error) {
      setUpgradeError(
        error instanceof Error
          ? error.message
          : 'Unable to upgrade the Draft schema. Reload and try again.',
      )
    } finally {
      upgradeLock.finish()
      setUpgradePending(false)
    }
  }

  async function submitDraft() {
    if (!activeSchema || !currentRequest || !canSubmitDraft || formReadOnly) {
      return
    }

    setSubmitting(true)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const latestActiveSchema = await api.fetchActiveFormSchema(currentRequest.formKey)
      const latestClassification = classifyDraftSchemaVersion(
        'request',
        currentRequest,
        latestActiveSchema,
      )

      if (!canSubmitDraftForSchemaVersion(latestClassification)) {
        const lockedSchema = activeSchemaFromRequest(currentRequest)
        const requiresChoice = isDraftSchemaDecisionRequired(latestClassification)

        setActiveRequestSchema(latestActiveSchema)
        setActiveSchema(lockedSchema)
        setDraftSchemaVersion(latestClassification)
        setDraftSchemaDecision(requiresChoice ? 'unresolved' : 'not-needed')
        setErrors({})
        setValues(buildRequestValuesForSchema(lockedSchema.schema, currentRequest.requesterData))
        if (requiresChoice) {
          setUpgradeError(
            'A newer active schema is available. Choose Upgrade or Remain before continuing.',
          )
        } else {
          setSaveError(
            'The Draft schema no longer matches the active schema. Reload the Draft before submitting.',
          )
        }
        return
      }

      const nextRequesterData = buildRequestValuesForSchema(latestActiveSchema.schema, values)
      const nextErrors = validateRequiredFields(latestActiveSchema.schema, nextRequesterData)

      setActiveRequestSchema(latestActiveSchema)
      setActiveSchema(latestActiveSchema)
      setDraftSchemaVersion(latestClassification)
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
        ? await api.updateDraftRequesterData(currentRequest.id, {
            formVersion: currentRequest.formVersion,
            requesterData: nextRequesterData,
          })
        : currentRequest
      const submittedRequest = await api.submitPsfRequest(readyToSubmit.id, {
        formVersion: latestActiveSchema.version,
      })

      setCurrentRequest(submittedRequest)
      setActiveRequestSchema(null)
      setActiveSchema(activeSchemaFromRequest(submittedRequest))
      setDraftSchemaVersion('not-applicable')
      setDraftSchemaDecision('not-needed')
      setValues(buildRequestValuesForSchema(submittedRequest.schemaSnapshot, submittedRequest.requesterData))
      setSaveMessage(`Request ${submittedRequest.requestNo} submitted.`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || loadedSchemaKey !== loadKey) {
    return <p className="page-card__description">Loading PSF request draft…</p>
  }

  if (loadError || !activeSchema) {
    return (
      <p className="status-pill status-pill--error" role="alert">
        {loadError ?? 'PSF request draft is unavailable.'}
      </p>
    )
  }

  if (isSchemaChoicePending && currentRequest && activeRequestSchema) {
    return (
      <>
        <RequestDraftStatus request={currentRequest} />
        <DraftSchemaUpgradeDecision
          activeVersion={activeRequestSchema.version}
          currentVersion={currentRequest.formVersion}
          error={upgradeError}
          isUpgradePending={upgradePending}
          onReload={reloadDraftSchema}
          onRemain={remainOnDraftSchema}
          onUpgrade={() => void upgradeDraftSchema()}
        />
      </>
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
      {schemaDecisionRequired &&
      draftSchemaDecision === 'remain' &&
      currentRequest &&
      activeRequestSchema ? (
        <DraftSchemaUpgradeDecision
          activeVersion={activeRequestSchema.version}
          currentVersion={currentRequest.formVersion}
          error={upgradeError}
          hasRemained
          isUpgradePending={upgradePending}
          onReload={reloadDraftSchema}
          onRemain={remainOnDraftSchema}
          onUpgrade={() => void upgradeDraftSchema()}
          showRemain={false}
        />
      ) : null}
      <DynamicFormRenderer
        errors={errors}
        onChange={!formReadOnly ? updateField : undefined}
        onSubmit={!formReadOnly ? saveDraft : undefined}
        readOnly={formReadOnly}
        schema={activeSchema.schema}
        submitLabel={saving ? 'Saving draft…' : submitLabel}
        values={values}
      />
      {currentRequest?.status === DRAFT_STATUS ? (
        <div className="dynamic-form__actions">
          <button
            aria-describedby={submitIsBlockedBySchema ? 'draft-schema-submit-status' : undefined}
            className="secondary-button"
            disabled={saving || submitting || upgradePending || !canSubmitDraft}
            onClick={() => void submitDraft()}
            type="button"
          >
            {submitting ? 'Submitting request…' : 'Submit request'}
          </button>
          {submitIsBlockedBySchema && schemaSubmissionMessage ? (
            <p id="draft-schema-submit-status" role="status">
              {schemaSubmissionMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
