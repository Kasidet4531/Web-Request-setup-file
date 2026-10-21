import { useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, CircleDot, LockKeyhole } from 'lucide-react'
import { RequestBreadcrumbContext, type RequestBreadcrumb } from './requestBreadcrumb'
import { PSF_CREATED_INFORMATION_PLACEHOLDER } from './RequestsWorkspace'
import { historyActionSummary } from './historyActionSummary'
import { AsyncNotice } from './ui/AsyncNotice'
import { PageHeader } from './ui/PageHeader'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { api, type RequestSnapshotResponse } from '../services/api'
import type { FormSchema } from '../types/forms'
import './RequestSnapshotPage.css'

interface FieldChange { fieldKey: string; fieldLabel: string; before: unknown }

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
          before: 'before' in change ? change.before : null,
        }]
      : [])
}

type SnapshotForm = 'requester' | 'psf'

const fieldRowId = (form: SnapshotForm, fieldKey: string) => `request-snapshot-${form}-field-${fieldKey}`
const removedRowId = (fieldKey: string) => `request-snapshot-removed-field-${fieldKey}`

/** A blank value reads "Not provided"; the stored value is left as it is. */
function StoredValue({ value }: { value: unknown }) {
  const shown = displayText(value)
  return shown
    ? <span className="request-snapshot__value">{shown}</span>
    : <span className="request-snapshot__value request-snapshot__value--empty">Not provided</span>
}

function ChangeBadge() {
  return <span className="request-snapshot__badge"><CircleDot aria-hidden="true" size={13} /> Changed in this update</span>
}

/** The value a field held before the update, under the value it holds after it. */
function EarlierValue({ value }: { value: unknown }) {
  return <div className="request-snapshot__before"><span className="request-snapshot__before-label">Before this update</span><StoredValue value={value} /></div>
}

/** Moves the reader, and keyboard focus, to an edited field or block. */
function JumpLink({ targetId, children }: { targetId: string; children: ReactNode }) {
  return (
    <a
      className="request-snapshot__jump"
      href={`#${targetId}`}
      onClick={(event) => {
        const target = document.getElementById(targetId)
        if (!target) return
        event.preventDefault()
        target.scrollIntoView({ block: 'start' })
        target.focus({ preventScroll: true })
      }}
    >
      <CircleDot aria-hidden="true" size={14} /> {children}
    </a>
  )
}

/** One form of the Request Snapshot: every field of its Form Schema of that time, label beside value. */
function SnapshotFormPanel({ form, title, schema, data, changes }: { form: SnapshotForm; title: string; schema: FormSchema; data: Record<string, unknown>; changes: FieldChange[] }) {
  return (
    <section aria-labelledby={`request-snapshot-${form}-heading`} className="request-snapshot__panel" id={`request-snapshot-${form}`}>
      <h2 id={`request-snapshot-${form}-heading`}>{title}</h2>
      {schema.sections.map((section) => (
        <section aria-labelledby={`request-snapshot-${form}-section-${section.sectionKey}`} className="request-snapshot__section" key={section.sectionKey}>
          <h3 id={`request-snapshot-${form}-section-${section.sectionKey}`}>{section.title}</h3>
          <dl className="request-snapshot__rows">
            {section.fields.map((field) => {
              const change = changes.find((candidate) => candidate.fieldKey === field.fieldKey)
              return (
                <div
                  className={`request-snapshot__row${change ? ' request-snapshot__row--changed' : ''}`}
                  id={fieldRowId(form, field.fieldKey)}
                  key={field.fieldKey}
                  tabIndex={change ? -1 : undefined}
                >
                  <dt>{field.label}{change ? <ChangeBadge /> : null}</dt>
                  <dd>
                    {change ? <span className="sr-only">After this update: </span> : null}
                    <StoredValue value={data[field.fieldKey]} />
                    {change ? <EarlierValue value={change.before} /> : null}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
    </section>
  )
}

/** One PSF Request as it stood right after an Audit History entry, with what that entry changed. */
export function RequestSnapshotView({ requestSnapshot }: { requestSnapshot: RequestSnapshotResponse }) {
  const { entry, psfCreatedDataVisible } = requestSnapshot
  const psfEntry = entry.actionType === 'PSF_CREATED_INFORMATION_UPDATED'
  // The server withholds such entries from a reader who may not see PSF Created Information; never show their edits regardless.
  const changes = psfEntry && !psfCreatedDataVisible ? [] : fieldChangesOf(entry.metadata)
  const changedSchema = psfEntry ? requestSnapshot.psfCreatedInformationSchema : requestSnapshot.schemaSnapshot
  const shownKeys = new Set(changedSchema.sections.flatMap((section) => section.fields.map((field) => field.fieldKey)))
  // A Form Version upgrade drops fields the newer Form Schema no longer has.
  const removed = changes.filter((change) => !shownKeys.has(change.fieldKey))
  const changedForm: SnapshotForm = psfEntry ? 'psf' : 'requester'
  const previousStatus = typeof entry.metadata.fromStatus === 'string' ? entry.metadata.fromStatus : null
  const statusChanged = previousStatus !== null && previousStatus !== requestSnapshot.status
  const editsHeading = [
    changes.length ? `${changes.length} ${changes.length === 1 ? 'field' : 'fields'} edited` : null,
    statusChanged ? 'Work Status changed' : null,
  ].filter(Boolean).join(' · ') || 'No edits recorded'

  return (
    <div className="request-snapshot">
      <header className="request-snapshot__recorded">
        <div>
          <h2>Recorded on <time dateTime={entry.createdAt}>{formatHistoryDateTime(entry.createdAt)}</time> ICT (UTC+7)</h2>
          <p>{historyActionSummary(entry)} · By {entry.actorDisplayName} ({entry.actorRole})</p>
          <p>
            Form Versions: Requester Information {requestSnapshot.formVersion}
            {psfCreatedDataVisible ? ` · PSF Created Information ${requestSnapshot.psfCreatedInformationSchema.version}` : null}
          </p>
        </div>
        <span className="request-snapshot__read-only"><LockKeyhole aria-hidden="true" size={14} /> Read only</span>
      </header>

      <nav aria-label="Changes in this update" className="request-snapshot__changes">
        <h2>{editsHeading}</h2>
        {statusChanged || changes.length ? (
          <ul>
            {statusChanged ? <li><JumpLink targetId="request-snapshot-status">Work Status</JumpLink></li> : null}
            {changes.filter((change) => shownKeys.has(change.fieldKey)).map((change) => (
              <li key={change.fieldKey}><JumpLink targetId={fieldRowId(changedForm, change.fieldKey)}>{change.fieldLabel}</JumpLink></li>
            ))}
            {removed.map((change) => (
              <li key={change.fieldKey}><JumpLink targetId={removedRowId(change.fieldKey)}>{change.fieldLabel} (removed)</JumpLink></li>
            ))}
          </ul>
        ) : null}
        {changes.length ? null : <p>No form-field edits were recorded for this update. The full form is shown below.</p>}
      </nav>

      <section
        aria-labelledby="request-snapshot-status-heading"
        className={`request-snapshot__status${statusChanged ? ' request-snapshot__status--changed' : ''}`}
        id="request-snapshot-status"
        tabIndex={statusChanged ? -1 : undefined}
      >
        <div className="request-snapshot__status-heading"><h2 id="request-snapshot-status-heading">Work Status</h2>{statusChanged ? <ChangeBadge /> : null}</div>
        {statusChanged ? (
          <dl>
            <div><dt>Before this update</dt><dd>{previousStatus}</dd></div>
            <div><dt>After this update</dt><dd>{requestSnapshot.status}</dd></div>
          </dl>
        ) : <p>{requestSnapshot.status}</p>}
      </section>

      <SnapshotFormPanel changes={psfEntry ? [] : changes} data={requestSnapshot.requesterData} form="requester" schema={requestSnapshot.schemaSnapshot} title="Requester Information" />

      {psfCreatedDataVisible
        ? <SnapshotFormPanel changes={psfEntry ? changes : []} data={requestSnapshot.psfCreatedData} form="psf" schema={requestSnapshot.psfCreatedInformationSchema} title="PSF Created Information" />
        : (
          <section aria-labelledby="request-snapshot-psf-unavailable" className="request-snapshot__panel">
            <h2 id="request-snapshot-psf-unavailable">PSF Created Information</h2>
            <p className="request-snapshot__note" role="status">{PSF_CREATED_INFORMATION_PLACEHOLDER}</p>
          </section>
        )}

      {removed.length ? (
        <section aria-labelledby="request-snapshot-removed-heading" className="request-snapshot__panel request-snapshot__removed" id="request-snapshot-removed">
          <h2 id="request-snapshot-removed-heading">Fields removed in this update</h2>
          <p>Form Version {changedSchema.version} no longer has these fields, so their values were dropped.</p>
          <dl className="request-snapshot__rows">
            {removed.map((change) => (
              <div className="request-snapshot__row" id={removedRowId(change.fieldKey)} key={change.fieldKey} tabIndex={-1}>
                <dt>{change.fieldLabel}</dt>
                <dd><EarlierValue value={change.before} /></dd>
              </div>
            ))}
          </dl>
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
    <article className="workflow-page request-snapshot-page">
      <PageHeader
        actions={<Link className="btn-secondary" params={{ requestId }} to="/requests/$requestId/history"><ArrowLeft aria-hidden="true" size={15} /> Request History</Link>}
        description={data ? `${data.requestNo} · The full request after this update. Read only.` : 'A request as it stood after one history entry.'}
        title="Request Snapshot"
      />
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
