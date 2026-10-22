import { formatFileSize } from './fileSize'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function displayValue(value: unknown): string {
  if (value === null) return 'Empty'
  if (typeof value === 'string') return value || 'Empty'
  return JSON.stringify(value, null, 2) ?? '—'
}

export function HistoryChanges({ metadata }: { metadata: Record<string, unknown> }) {
  const changes = Array.isArray(metadata.fieldChanges)
    ? metadata.fieldChanges.filter((change): change is Record<string, unknown> =>
      isRecord(change) && Object.hasOwn(change, 'before') && Object.hasOwn(change, 'after') &&
      (typeof change.fieldLabel === 'string' || typeof change.fieldKey === 'string'))
    : []
  const statusChange = typeof metadata.fromStatus === 'string' && typeof metadata.toStatus === 'string'

  // An Attachment upload or deletion records its file, not field changes.
  if (typeof metadata.filename === 'string') {
    return <span className="history-attachment">{metadata.filename}{typeof metadata.sizeBytes === 'number' ? ` (${formatFileSize(metadata.sizeBytes)})` : ''}</span>
  }

  // A Workflow catalog update records configuration, not changes to show, so it gets a dash too.
  if (!changes.length && !statusChange) return <>—</>

  return (
    <details className="history-changes">
      <summary>View changes</summary>
      <table className="history-changes__table">
        <caption>Recorded changes</caption>
        <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
        <tbody>
          {statusChange ? <tr><th scope="row">Work Status</th><td><pre className="history-changes__value">{metadata.fromStatus as string}</pre></td><td><pre className="history-changes__value">{metadata.toStatus as string}</pre></td></tr> : null}
          {changes.map((change, index) => (
            <tr key={index}>
              <th scope="row">{String(change.fieldLabel ?? change.fieldKey)}</th>
              <td><pre className="history-changes__value">{displayValue(change.before)}</pre></td>
              <td><pre className="history-changes__value">{displayValue(change.after)}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
