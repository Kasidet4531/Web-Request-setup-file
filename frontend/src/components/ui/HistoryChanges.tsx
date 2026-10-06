function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function displayValue(value: unknown): string {
  if (value === null) return 'Empty'
  if (typeof value === 'string') return value || 'Empty'
  return JSON.stringify(value, null, 2) ?? '—'
}

function displayCatalog(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.entries)) return 'Catalog details unavailable'
  const entries = value.entries.filter((entry): entry is Record<string, unknown> =>
    isRecord(entry) && typeof entry.name === 'string')
  const kinds: Record<string, string> = { draft: 'Draft', open: 'Open work', completed: 'Completed', cancelled: 'Cancelled' }
  const names = entries.map((entry) => `${entry.name as string}${typeof entry.kind === 'string' && Object.hasOwn(kinds, entry.kind) ? ` (${kinds[entry.kind]})` : ''}`)
  if (Array.isArray(value.psfVisibilityTriggerIds)) {
    const triggers = value.psfVisibilityTriggerIds.map((id) => entries.find((entry) => entry.id === id)?.name ?? 'Unavailable')
    return [...names, `PSF visibility triggers: ${triggers.length ? triggers.join(', ') : 'None'}`].join('\n')
  }
  const trigger = value.psfVisibilityTriggerId === null ? 'None'
    : entries.find((entry) => entry.id === value.psfVisibilityTriggerId)?.name ?? 'Unavailable'
  return [...names, `PSF visibility trigger: ${String(trigger)}`].join('\n')
}

function displayOwner(value: Record<string, unknown>): string {
  return typeof value.setupOwner === 'string' && value.setupOwner
    ? `${value.setupOwner}${typeof value.setupOwnerRole === 'string' && value.setupOwnerRole ? ` / ${value.setupOwnerRole}` : ''}`
    : 'Unassigned'
}

export function HistoryChanges({ metadata }: { metadata: Record<string, unknown> }) {
  const changes = Array.isArray(metadata.fieldChanges)
    ? metadata.fieldChanges.filter((change): change is Record<string, unknown> =>
      isRecord(change) && Object.hasOwn(change, 'before') && Object.hasOwn(change, 'after') &&
      (typeof change.fieldLabel === 'string' || typeof change.fieldKey === 'string'))
    : []
  const statusChange = typeof metadata.fromStatus === 'string' && typeof metadata.toStatus === 'string'
  const assignmentBefore = isRecord(metadata.before) && Object.hasOwn(metadata.before, 'setupOwnerUserId') ? metadata.before : null
  const assignmentAfter = isRecord(metadata.after) && Object.hasOwn(metadata.after, 'setupOwnerUserId') ? metadata.after : null
  const assignmentChange = assignmentBefore && assignmentAfter
  const catalogOperation = isRecord(metadata.operation) ? metadata.operation : null
  const catalogChange = catalogOperation && Object.hasOwn(metadata, 'before') && Object.hasOwn(metadata, 'after')

  if (!changes.length && !statusChange && !catalogOperation && !assignmentChange) return <>—</>

  return (
    <details className="history-changes">
      <summary>View changes</summary>
      {statusChange ? <p>{`Status: ${metadata.fromStatus as string} → ${metadata.toStatus as string}`}</p> : null}
      {catalogOperation ? <p>Catalog operation: {displayValue(catalogOperation.action)}{typeof catalogOperation.name === 'string' ? ` — ${catalogOperation.name}` : ''}</p> : null}
      {typeof metadata.releasedRequestCount === 'number' && metadata.releasedRequestCount > 0 ? <p>{`Requester PSF access released for ${metadata.releasedRequestCount} request(s).`}</p> : null}
      {changes.length || catalogChange || assignmentChange ? (
        <table className="history-changes__table">
          <caption>Recorded changes</caption>
          <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
          <tbody>
            {changes.map((change, index) => (
              <tr key={index}>
                <th scope="row">{String(change.fieldLabel ?? change.fieldKey)}</th>
                <td><pre className="history-changes__value">{displayValue(change.before)}</pre></td>
                <td><pre className="history-changes__value">{displayValue(change.after)}</pre></td>
              </tr>
            ))}
            {assignmentChange ? <tr><th scope="row">Owner / Dept</th><td>{displayOwner(assignmentBefore)}</td><td>{displayOwner(assignmentAfter)}</td></tr> : null}
            {catalogChange ? <tr><th scope="row">Status catalog</th><td><pre className="history-changes__value">{displayCatalog(metadata.before)}</pre></td><td><pre className="history-changes__value">{displayCatalog(metadata.after)}</pre></td></tr> : null}
          </tbody>
        </table>
      ) : null}
    </details>
  )
}
