/**
 * Autofill highlight: in the open Requester form only, a field Autofill filled shows "Auto-filled" in one
 * colour and a field the Requester changed after Autofill shows "Edited by user" in another. Nothing about
 * it is saved: a reloaded page or a reopened Draft starts with every field plain.
 *
 * The form holds the highlights in its own state, changes them only through these functions, and passes
 * them to the renderer, whose rows take `autofillHighlightRowClass` (colours in `index.css`). The one
 * exception to "a load starts plain" is New Request's first save, which opens the new Draft's page: for
 * the Requester the form stayed open, so New Request hands its highlights over (see below).
 */
export type AutofillHighlight = 'auto-filled' | 'edited-by-user'

/** Highlights by field key; a field without an entry is plain. */
export type AutofillHighlights = Partial<Record<string, AutofillHighlight>>

export const AUTOFILL_HIGHLIGHT_LABELS: Record<AutofillHighlight, string> = {
  'auto-filled': 'Auto-filled',
  'edited-by-user': 'Edited by user',
}

/** The row modifier class that colours a highlighted field's row. */
export function autofillHighlightRowClass(highlight: AutofillHighlight): string {
  return `dynamic-form__row--${highlight}`
}

/** Autofill filled these fields this time: each turns "Auto-filled", whatever it showed before; other fields keep theirs. */
export function markAutoFilled(
  highlights: AutofillHighlights,
  fieldKeys: readonly string[],
): AutofillHighlights {
  if (fieldKeys.length === 0) return highlights
  const next = { ...highlights }
  fieldKeys.forEach((fieldKey) => {
    next[fieldKey] = 'auto-filled'
  })
  return next
}

/** The Requester changed a field: an auto-filled field turns "Edited by user"; a field Autofill never filled stays plain. */
export function markEditedByUser(
  highlights: AutofillHighlights,
  fieldKey: string,
): AutofillHighlights {
  return highlights[fieldKey] === 'auto-filled'
    ? { ...highlights, [fieldKey]: 'edited-by-user' }
    : highlights
}

/**
 * Highlights New Request hands to the Draft page its first save opens. Kept in this module's memory
 * only, never in the router's history state (a browser reload restores that), so a reload starts plain.
 */
let handedOver: { requestId: string; highlights: AutofillHighlights } | null = null

/** New Request is opening the Draft it just saved: that Draft's page shows these highlights on its first load. */
export function handOverAutofillHighlights(requestId: string, highlights: AutofillHighlights): void {
  handedOver = { requestId, highlights }
}

/**
 * Takes the highlights handed over for this request. A hand-off is used up by the first form load after
 * it, whichever request that load is for, so reopening the Draft later always starts plain.
 */
export function takeHandedOverAutofillHighlights(requestId: string): AutofillHighlights {
  const current = handedOver
  handedOver = null
  return current?.requestId === requestId ? current.highlights : {}
}
