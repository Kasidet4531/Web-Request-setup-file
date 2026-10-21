/** Development-only preview of the selected Detail layout, ?variant=A. */
import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, CircleDot, LockKeyhole } from 'lucide-react'
import type { RequestSnapshotResponse } from '../services/api'
import type { FormSchema, FormSchemaField } from '../types/forms'
import { historyActionSummary } from './historyActionSummary'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { PSF_CREATED_INFORMATION_PLACEHOLDER } from './RequestsWorkspace'
import './RequestSnapshotPrototype.css'

export type SnapshotPrototypeVariant = 'A'

interface Change { fieldKey: string; fieldLabel: string; before: unknown }
interface ReadingSection { id: string; title: string; schema: FormSchema; data: Record<string, unknown>; changes: Change[] }

function EventBadge() {
  return <span className="snapshot-prototype__event-badge"><CircleDot size={13} aria-hidden="true" /> Changed in this update</span>
}

function fieldId(formId: string, key: string) { return `${formId}-field-${key}` }

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function changesOf(snapshot: RequestSnapshotResponse): Change[] {
  const changes = snapshot.entry.metadata.fieldChanges
  if (!Array.isArray(changes)) return []
  return changes.flatMap((change: unknown) => {
    if (typeof change !== 'object' || change === null || !('fieldKey' in change) || typeof change.fieldKey !== 'string') return []
    return [{ fieldKey: change.fieldKey,
      fieldLabel: 'fieldLabel' in change && typeof change.fieldLabel === 'string' ? change.fieldLabel : change.fieldKey,
      before: 'before' in change ? change.before : null }]
  })
}

function HistoricalValue({ value, change }: { value: unknown; change?: Change }) {
  return <>
    <span className="snapshot-prototype__value">{displayValue(value)}</span>
    {change ? <div className="snapshot-prototype__previous">
      <span className="snapshot-prototype__previous-label">Before this update</span>
      <span>{displayValue(change.before)}</span>
    </div> : null}
  </>
}

function FieldValues({ form, field }: { form: ReadingSection; field: FormSchemaField }) {
  const value = form.data[field.fieldKey]
  const change = form.changes.find((item) => item.fieldKey === field.fieldKey)
  return <><span className="sr-only">After this update: </span><HistoricalValue value={value} change={change} /></>
}

function SnapshotContext({ snapshot, requestId, changes, controls }: {
  snapshot: RequestSnapshotResponse; requestId: string; changes: Change[]; controls: ReactNode
}) {
  const { entry } = snapshot
  const beforeStatus = typeof entry.metadata.fromStatus === 'string' ? entry.metadata.fromStatus : null
  const statusChanged = beforeStatus !== null && beforeStatus !== snapshot.status
  const psfEntry = entry.actionType === 'PSF_CREATED_INFORMATION_UPDATED'
  const schema = psfEntry ? snapshot.psfCreatedInformationSchema : snapshot.schemaSnapshot
  const keys = new Set(schema.sections.flatMap((section) => section.fields.map((field) => field.fieldKey)))
  return <header className="snapshot-prototype__context">
    {requestId === 'prototype' ? <p className="snapshot-prototype__sample">Sample data. These values are examples.</p> : null}
    <div className="snapshot-prototype__heading">
      <div><h1>Request Snapshot</h1><p>{snapshot.requestNo} · Full request after this update</p></div>
      <Link className="btn-secondary" params={{ requestId }} to="/requests/$requestId/history"><ArrowLeft size={15} /> Request History</Link>
    </div>
    <div className="snapshot-prototype__recorded">
      <div>
        <h2>Recorded on <time dateTime={entry.createdAt}>{formatHistoryDateTime(entry.createdAt)}</time> ICT (UTC+7)</h2>
        <p>{historyActionSummary(entry)} · By {entry.actorDisplayName} ({entry.actorRole})</p>
        <p>Form Versions: Requester {snapshot.formVersion} · PSF {snapshot.psfCreatedInformationSchema.version}</p>
      </div>
      <span className="snapshot-prototype__readonly"><LockKeyhole size={14} /> Read only</span>
    </div>
    <nav className="snapshot-prototype__change-summary" aria-label="Changes in this update">
      <h2>{changes.length} {changes.length === 1 ? 'field edited' : 'fields edited'}{statusChanged ? ' · Work Status changed' : ' · Work Status unchanged'}</h2>
      <div>{statusChanged ? <a className="snapshot-prototype__jump" href="#snapshot-status"><CircleDot size={14} aria-hidden="true" /> Work Status</a> : null}
        {changes.map((change) => <a className="snapshot-prototype__jump" key={change.fieldKey} href={`#${encodeURIComponent(keys.has(change.fieldKey) ? fieldId(psfEntry ? 'snapshot-psf' : 'snapshot-requester', change.fieldKey) : 'snapshot-removed')}`}><CircleDot size={14} aria-hidden="true" /> {change.fieldLabel}</a>)}
        {!changes.length ? <p>No field edits were recorded for this update. The full form is below.</p> : null}
      </div>
    </nav>
    {controls ? <div className="snapshot-prototype__controls">{controls}</div> : null}
    <section id="snapshot-status" className={`snapshot-prototype__status-event${statusChanged ? ' snapshot-prototype__status-event--changed' : ''}`} aria-labelledby="snapshot-status-title">
      <div className="snapshot-prototype__status-title"><h2 id="snapshot-status-title">Work Status</h2>{statusChanged ? <EventBadge /> : null}</div>
      <dl className="snapshot-prototype__status">
        {statusChanged ? <div><dt>Before this update</dt><dd>{beforeStatus}</dd></div> : null}
        <div><dt>After this update · {formatHistoryDateTime(entry.createdAt)} ICT</dt><dd>{snapshot.status}</dd></div>
      </dl>
    </section>
    <p className="snapshot-prototype__reading-key"><CircleDot size={14} aria-hidden="true" /> Orange marks edits in this update. The full form is shown below.</p>
  </header>
}

/** A keeps the Detail page's centred column, separate form panels and aligned label/value rows. */
function SnapshotDetailVariant({ sections, extra }: { sections: ReadingSection[]; extra: ReactNode }) {
  return <div className="snapshot-prototype__detail">
    {sections.map((form) => <section className="snapshot-prototype__panel" key={form.id} aria-labelledby={`${form.id}-title`} id={form.id}>
      <h2 id={`${form.id}-title`}>{form.title}</h2>
      {form.schema.sections.map((section) => <section className="snapshot-prototype__detail-section" key={section.sectionKey} aria-labelledby={`${form.id}-${section.sectionKey}`}>
        <h3 id={`${form.id}-${section.sectionKey}`}>{section.title}</h3>
        <dl className="snapshot-prototype__rows">
          {section.fields.map((field) => <div id={fieldId(form.id, field.fieldKey)} className={`snapshot-prototype__row${form.changes.some((change) => change.fieldKey === field.fieldKey) ? ' snapshot-prototype__row--changed' : ''}`} key={field.fieldKey}>
            <dt>{field.label}{form.changes.some((change) => change.fieldKey === field.fieldKey) ? <EventBadge /> : null}</dt>
            <dd><FieldValues form={form} field={field} /></dd>
          </div>)}
        </dl>
      </section>)}
    </section>)}
    {extra}
  </div>
}

export default function RequestSnapshotPrototype({ requestSnapshot: snapshot, requestId }: {
  requestSnapshot: RequestSnapshotResponse; requestId: string
}) {
  const navigate = useNavigate({ from: '/requests/$requestId/history/$entryId' })
  const changes = changesOf(snapshot)
  const psfEntry = snapshot.entry.actionType === 'PSF_CREATED_INFORMATION_UPDATED'
  const sections: ReadingSection[] = [{ id: 'snapshot-requester', title: 'Requester Information', schema: snapshot.schemaSnapshot, data: snapshot.requesterData, changes: psfEntry ? [] : changes }]
  if (snapshot.psfCreatedDataVisible) sections.push({ id: 'snapshot-psf', title: 'PSF Created Information', schema: snapshot.psfCreatedInformationSchema, data: snapshot.psfCreatedData, changes: psfEntry ? changes : [] })
  const changedSchema = psfEntry ? snapshot.psfCreatedInformationSchema : snapshot.schemaSnapshot
  const presentKeys = new Set(changedSchema.sections.flatMap((section) => section.fields.map((field) => field.fieldKey)))
  const removed = changes.filter((change) => !presentKeys.has(change.fieldKey))
  const extra = <>
    {!snapshot.psfCreatedDataVisible ? <section className="snapshot-prototype__unavailable"><h2>PSF Created Information</h2><p>{PSF_CREATED_INFORMATION_PLACEHOLDER}</p></section> : null}
    {removed.length ? <section id="snapshot-removed" className="snapshot-prototype__removed"><h2>Fields removed in this update</h2><p>These fields were removed from the form. Their earlier values are shown below.</p>
      <dl>{removed.map((change) => <div key={change.fieldKey}><dt>{change.fieldLabel}</dt><dd><span className="snapshot-prototype__previous-label">Before this update</span><span className="snapshot-prototype__value">{displayValue(change.before)}</span></dd></div>)}</dl>
    </section> : null}
  </>

  return <article className="snapshot-prototype snapshot-prototype--A">
    <SnapshotContext snapshot={snapshot} requestId={requestId} changes={changes} controls={requestId === 'prototype' ?
      <label className="snapshot-prototype__example">Choose an example<select value={snapshot.entry.id} onChange={(event) => { void navigate({ params: { requestId, entryId: event.target.value }, search: { variant: 'A' }, resetScroll: true }) }}><option value="entry-1">Request fields edited</option><option value="status-1">Work Status changed</option></select></label> : null} />
    <SnapshotDetailVariant sections={sections} extra={extra} />
    <footer className="snapshot-prototype__end"><p>End of Request Snapshot · {snapshot.requestNo}</p><a href="#main-content">Back to top <ArrowRight size={13} /></a></footer>
  </article>
}
