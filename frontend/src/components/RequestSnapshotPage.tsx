import { useContext, useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { RequestBreadcrumbContext, type RequestBreadcrumb } from './requestBreadcrumb'
import { PSF_CREATED_INFORMATION_PLACEHOLDER } from './RequestsWorkspace'
import { historyActionSummary } from './historyActionSummary'
import { AsyncNotice } from './ui/AsyncNotice'
import { PageHeader } from './ui/PageHeader'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { api, type RequestSnapshotResponse } from '../services/api'
import type { DynamicFormValues, FormSchema } from '../types/forms'

interface FieldChange { fieldKey: string; fieldLabel: string; before: string }

function displayText(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value)
}

function fieldChangesOf(metadata: Record<string, unknown>): FieldChange[] {
  if (!Array.isArray(metadata.fieldChanges)) return []
  return metadata.fieldChanges.flatMap((change: unknown) =>
    typeof change === 'object' && change !== null && 'fieldKey' in change && typeof change.fieldKey === 'string'
      ? [{
          fieldKey: change.fieldKey,
          fieldLabel: 'fieldLabel' in change && typeof change.fieldLabel === 'string' ? change.fieldLabel : change.fieldKey,
          before: displayText('before' in change ? change.before : null),
        }]
      : [])
}

function formValues(schema: FormSchema, data: Record<string, unknown>): DynamicFormValues {
  return Object.fromEntries(schema.sections.flatMap((section) => section.fields.map((field) => [field.fieldKey, displayText(data[field.fieldKey])])))
}

/** One PSF Request as it stood right after an Audit History entry, with what that entry changed. */
export function RequestSnapshotView({ requestSnapshot }: { requestSnapshot: RequestSnapshotResponse }) {
  const { entry } = requestSnapshot
  const changes = fieldChangesOf(entry.metadata)
  const psfEntry = entry.actionType === 'PSF_CREATED_INFORMATION_UPDATED'
  const changedSchema = psfEntry ? requestSnapshot.psfCreatedInformationSchema : requestSnapshot.schemaSnapshot
  const shownKeys = new Set(changedSchema.sections.flatMap((section) => section.fields.map((field) => field.fieldKey)))
  const previousValues = Object.fromEntries(changes.filter((change) => shownKeys.has(change.fieldKey)).map((change) => [change.fieldKey, change.before]))
  // A Form Version upgrade drops fields the newer Form Schema no longer has.
  const removed = changes.filter((change) => !shownKeys.has(change.fieldKey))
  const previousStatus = typeof entry.metadata.fromStatus === 'string' ? entry.metadata.fromStatus : null

  return (
    <div className="detail-editors request-requestSnapshot">
      <section className="workflow-section request-snapshot__summary" aria-labelledby="request-requestSnapshot-summary">
        <div className="section-heading"><h2 id="request-requestSnapshot-summary">{historyActionSummary(entry)}</h2></div>
        <dl>
          <dt>Recorded</dt>
          <dd>{entry.actorDisplayName} · {entry.actorRole} · <time dateTime={entry.createdAt}>{formatHistoryDateTime(entry.createdAt)}</time></dd>
          <dt>Work Status</dt>
          <dd>{requestSnapshot.status}{previousStatus ? <span className="dynamic-form__previous"> Previous: {previousStatus}</span> : null}</dd>
          <dt>Changed fields</dt>
          <dd>{changes.length ? changes.map((change) => change.fieldLabel).join(', ') : 'None'}</dd>
        </dl>
      </section>

      <section className="workflow-section" aria-labelledby="request-requestSnapshot-requester">
        <div className="section-heading"><h2 id="request-requestSnapshot-requester">Requester Information</h2></div>
        <DynamicFormRenderer
          headerTitle="Requester Information"
          previousValues={psfEntry ? undefined : previousValues}
          readOnly
          schema={requestSnapshot.schemaSnapshot}
          showSchemaHeader={false}
          values={formValues(requestSnapshot.schemaSnapshot, requestSnapshot.requesterData)}
        />
      </section>

      <section className="workflow-section" aria-labelledby="request-requestSnapshot-psf">
        <div className="section-heading"><h2 id="request-requestSnapshot-psf">PSF Created Information</h2></div>
        {requestSnapshot.psfCreatedDataVisible ? (
          <DynamicFormRenderer
            headerTitle="PSF Created Information"
            previousValues={psfEntry ? previousValues : undefined}
            readOnly
            schema={requestSnapshot.psfCreatedInformationSchema}
            showSchemaHeader={false}
            values={formValues(requestSnapshot.psfCreatedInformationSchema, requestSnapshot.psfCreatedData)}
          />
        ) : <p className="page-card__description" role="status">{PSF_CREATED_INFORMATION_PLACEHOLDER}</p>}
      </section>

      {removed.length ? (
        <section className="workflow-section" aria-labelledby="request-requestSnapshot-removed">
          <div className="section-heading"><h2 id="request-requestSnapshot-removed">Removed fields</h2></div>
          <p className="page-card__description">Form Version {requestSnapshot.formVersion} no longer has these fields, so their values were dropped.</p>
          <table className="history-changes__table">
            <thead><tr><th scope="col">Field</th><th scope="col">Previous value</th></tr></thead>
            <tbody>
              {removed.map((change) => (
                <tr key={change.fieldKey}>
                  <th scope="row">{change.fieldLabel}</th>
                  <td><pre className="history-changes__value">{change.before || 'Empty'}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  )
}

interface RequestSnapshotState { key: string; error: string | null; data: RequestSnapshotResponse | null }

export function RequestSnapshotPage({ requestId, entryId, onIdentityResolved }: { requestId: string; entryId: string; onIdentityResolved?: (value: RequestBreadcrumb | null) => void }) {
  const key = `${requestId}/${entryId}`
  const [state, setState] = useState<RequestSnapshotState>({ key, error: null, data: null })
  const [retry, setRetry] = useState(0)
  const current = state.key === key ? state : { key, error: null, data: null }

  useEffect(() => {
    let active = true
    api.fetchRequestSnapshot(requestId, entryId)
      .then((data) => { if (active) setState({ key, error: null, data }) })
      .catch((error: unknown) => { if (active) setState({ key, error: error instanceof Error ? error.message : 'Unable to load Request Snapshot', data: null }) })
    return () => { active = false }
  }, [key, requestId, entryId, retry])

  const data = current.data
  useEffect(() => {
    onIdentityResolved?.(data ? { requestId, requestNo: data.requestNo, isDraft: data.currentStatus === 'Draft' } : null)
    return () => onIdentityResolved?.(null)
  }, [data, requestId, onIdentityResolved])

  return (
    <article className="workflow-page request-requestSnapshot-page">
      <PageHeader title="Request Snapshot" description={data ? `${data.requestNo} as it stood after this entry. Read only.` : 'A request as it stood after one history entry.'} />
      {!data && !current.error ? <AsyncNotice kind="loading" title="Loading Request Snapshot…" /> : null}
      {current.error ? <AsyncNotice kind="error" title={`Unable to load Request Snapshot: ${current.error}`} action={<button className="btn-secondary" onClick={() => { setState({ key, error: null, data: null }); setRetry((value) => value + 1) }} type="button">Retry</button>} /> : null}
      {data ? <RequestSnapshotView requestSnapshot={data} /> : null}
    </article>
  )
}

export function RequestSnapshotRoutePage() {
  const { requestId, entryId } = useParams({ from: '/requests/$requestId/history_/$entryId' })
  const setRequestBreadcrumb = useContext(RequestBreadcrumbContext)
  return <RequestSnapshotPage requestId={requestId} entryId={entryId} onIdentityResolved={setRequestBreadcrumb} />
}
