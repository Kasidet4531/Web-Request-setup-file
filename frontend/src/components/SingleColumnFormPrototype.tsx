// PROTOTYPE: throwaway code on branch prototype/single-column-form. Never merge.
//
// Question: what should the dynamic form look like as a single column, both
// editable and read-only?
// Plan: three single-column variants of the existing New Request page
// (/requests/new), switchable with ?variant=A|B|C (D combines B and C), plus ?view=read for the
// read-only arrangement and ?sample=true to fill the form with a real
// request's values. Field order, grouping, labels and visibility are unchanged.
// Save is stubbed: nothing is sent to the shared dev database.
//
// Verdict (21 Oct 2026, confirmed by the user): variant D.
// - Editable: B's spec-sheet rows (label left, control right, one row per
//   field, row dividers) with C's action bar pinned to the bottom of the
//   viewport, and the Save button at the far right edge of the card.
// - Edit mode uses the same label type as read-only (14px bold, foreground)
//   and the same row height, so switching modes moves nothing; only wrapping
//   radio groups and the Description textarea are taller while editing.
// - Read-only views (request detail, Admin Draft detail, Request Snapshot)
//   use the same B rows: label left, value right.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { PrototypeSwitcher } from './ui/PrototypeSwitcher'
import { api } from '../services/api'
import type { DynamicFormValues } from '../types/forms'
import './SingleColumnFormPrototype.css'

export const FORM_LAYOUT_VARIANTS = [
  { key: 'A', name: 'Label above, narrow column' },
  { key: 'B', name: 'Label left, control right' },
  { key: 'C', name: 'Label above + sticky action bar' },
  // Added after review: the user's pick, B's rows with C's pinned bar and Save at the far right.
  { key: 'D', name: 'B rows + sticky bar, Save far right' },
] as const

export type FormLayoutVariant = (typeof FORM_LAYOUT_VARIANTS)[number]['key']

export interface SingleColumnPrototypeSearch {
  variant?: FormLayoutVariant
  view?: 'edit' | 'read'
  sample?: boolean
}

export function parseSingleColumnPrototypeSearch(search: Record<string, unknown>): SingleColumnPrototypeSearch {
  return {
    variant: FORM_LAYOUT_VARIANTS.find((variant) => variant.key === search.variant)?.key,
    view: search.view === 'read' || search.view === 'edit' ? search.view : undefined,
    sample: search.sample === true || search.sample === 'true' ? true : undefined,
  }
}

export interface SingleColumnPrototypeState {
  variant: FormLayoutVariant
  readOnly: boolean
  sampleValues: DynamicFormValues | null
  onStubbedSave: () => void
}

const SingleColumnPrototypeContext = createContext<SingleColumnPrototypeState | null>(null)

/** The active prototype settings, or null outside the prototype (always null in production). */
export function useSingleColumnPrototype(): SingleColumnPrototypeState | null {
  return useContext(SingleColumnPrototypeContext)
}

// PSF-005879 on the shared dev database fills 41 of the 42 Requester fields.
const SAMPLE_REQUEST_ID = '508988a0-502e-47d0-907a-d2731b0fcb00'
const SAMPLE_REQUEST_NO = 'PSF-005879'

export function SingleColumnFormPrototype({ children }: { children: ReactNode }) {
  if (!import.meta.env.DEV) return <>{children}</>
  return <SingleColumnFormPrototypeShell>{children}</SingleColumnFormPrototypeShell>
}

function SingleColumnFormPrototypeShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const search = useSearch({ from: '/requests/new' })
  const variant = search.variant ?? 'A'
  const readOnly = search.view === 'read'
  const sample = search.sample === true
  const [sampleValues, setSampleValues] = useState<DynamicFormValues | null>(null)
  const [sampleError, setSampleError] = useState<string | null>(null)
  const [lastStubbedSave, setLastStubbedSave] = useState<string | null>(null)

  useEffect(() => {
    if (!sample) {
      setSampleValues(null)
      return
    }
    let mounted = true
    setSampleError(null)
    // Read-only GET of an existing request; the prototype never writes.
    api.fetchPsfRequest(SAMPLE_REQUEST_ID)
      .then((request) => { if (mounted) setSampleValues(request.requesterData) })
      .catch((error: unknown) => { if (mounted) setSampleError(error instanceof Error ? error.message : 'Sample load failed') })
    return () => { mounted = false }
  }, [sample])

  function update(next: SingleColumnPrototypeSearch) {
    void navigate({ to: '/requests/new', search: (previous) => ({ ...previous, ...next }), replace: true })
  }

  const state: SingleColumnPrototypeState = {
    variant,
    readOnly,
    sampleValues,
    onStubbedSave: () => setLastStubbedSave(new Date().toLocaleTimeString()),
  }

  return (
    <SingleColumnPrototypeContext.Provider value={state}>
      {/* Read-only request views (detail, Admin Draft detail, Snapshot) all sit inside .detail-editors. */}
      <div className={readOnly ? 'detail-editors prototype-host' : 'prototype-host'}>{children}</div>
      <PrototypeSwitcher current={variant} lifted={(variant === 'C' || variant === 'D') && !readOnly} onChange={(key) => update({ variant: key as FormLayoutVariant })} variants={FORM_LAYOUT_VARIANTS}>
        <span aria-label="Mode" className="prototype-switcher__segment" role="group">
          <button aria-pressed={!readOnly} onClick={() => update({ view: 'edit' })} type="button">Editable</button>
          <button aria-pressed={readOnly} onClick={() => update({ view: 'read' })} type="button">Read-only</button>
        </span>
        <span aria-label="Values" className="prototype-switcher__segment" role="group">
          <button aria-pressed={!sample} onClick={() => update({ sample: undefined })} type="button">Empty</button>
          <button aria-pressed={sample} onClick={() => update({ sample: true })} type="button">{SAMPLE_REQUEST_NO}</button>
        </span>
        <span className="prototype-switcher__status">
          {sampleError ? `Sample failed: ${sampleError}` : sample && !sampleValues ? 'Loading sample…' : lastStubbedSave ? `Save stubbed at ${lastStubbedSave}, nothing sent` : 'Save is stubbed'}
        </span>
      </PrototypeSwitcher>
    </SingleColumnPrototypeContext.Provider>
  )
}
