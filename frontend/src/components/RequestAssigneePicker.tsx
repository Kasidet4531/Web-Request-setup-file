import { useEffect, useId, useState } from 'react'
import { api, type AssignableSetupOwner } from '../services/api'

export interface RequestAssigneePickerProps {
  // undefined preserves a legacy name-only record until an explicit choice is made.
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
  recordedOwner?: string
  onAvailabilityChange?: (available: boolean) => void
}

const RECORDED_OWNER = '__recorded_owner__'

function isDirectory(value: unknown): value is { items: AssignableSetupOwner[] } {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) return false
  const ids = new Set<string>()
  return value.items.every((item: unknown) => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) ||
      !('displayName' in item) || typeof item.displayName !== 'string' || !item.displayName.trim() ||
      !('setupOwnerDepartment' in item) || !['GNTC', 'MFG'].includes(String(item.setupOwnerDepartment))) return false
    ids.add(item.id)
    return true
  })
}

export function RequestAssigneePicker({ value, onChange, disabled = false, recordedOwner, onAvailabilityChange }: RequestAssigneePickerProps) {
  const id = useId()
  const [items, setItems] = useState<AssignableSetupOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      onAvailabilityChange?.(false)
      try {
        const directory = await api.fetchRequestAssignees()
        if (!isDirectory(directory)) throw new Error('The setup owner directory returned invalid data.')
        if (active) {
          setItems(directory.items)
          setLoading(false)
          onAvailabilityChange?.(true)
        }
      } catch (failure) {
        if (active) {
          setError(failure instanceof Error ? failure.message : 'Unable to load setup owners.')
          setLoading(false)
        }
      }
    }
    void load()
    return () => { active = false }
  }, [retry, onAvailabilityChange])

  const query = search.trim().toLowerCase()
  const visibleItems = items.filter(item => item.id === value || `${item.displayName} ${item.setupOwnerDepartment}`.toLowerCase().includes(query))
  const selectedMissing = Boolean(value && !items.some(item => item.id === value))
  return <section className="request-assignee-picker" aria-label="Request assignment" aria-busy={loading}>
    <label htmlFor={`${id}-search`}>Search setup owners</label>
    <input id={`${id}-search`} aria-label="Search setup owners" type="search" value={search} disabled={disabled || loading || Boolean(error)} onChange={event => setSearch(event.target.value)} />
    <label htmlFor={`${id}-owner`}>Setup owner</label>
    <select id={`${id}-owner`} aria-label="Setup owner" value={value === undefined ? RECORDED_OWNER : value ?? ''} disabled={disabled || loading || Boolean(error)} onChange={event => {
      if (disabled || loading || error || event.target.value === RECORDED_OWNER) return
      onChange(event.target.value || null)
    }}>
      <option value="">Unassigned</option>
      {value === undefined ? <option value={RECORDED_OWNER}>{recordedOwner ?? 'Recorded owner'} (recorded)</option> : null}
      {selectedMissing ? <option value={value ?? ''}>{recordedOwner ?? 'Current owner'} (recorded)</option> : null}
      {visibleItems.map(item => <option key={item.id} value={item.id}>{item.displayName} / {item.setupOwnerDepartment}</option>)}
    </select>
    {loading ? <p className="ui-help" role="status">Loading setup owners…</p> : null}
    {error ? <div className="ui-help" role="alert">Unable to load setup owners: {error} <button type="button" className="btn-secondary" disabled={disabled} onClick={() => setRetry(current => current + 1)}>Retry</button></div> : null}
    {!loading && !error && items.length === 0 ? <p className="ui-help">No setup owners are available. You can leave this request Unassigned.</p> : null}
  </section>
}
