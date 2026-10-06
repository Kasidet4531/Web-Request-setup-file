import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type PsfRequestResponse } from '../services/api'
import { RequestAssignmentDialog } from './RequestAssignmentDialog'
import { RequestAssigneePicker } from './RequestAssigneePicker'
const requestApi = vi.hoisted(() => ({ updatePsfRequestAssignment: vi.fn(), fetchPsfRequest: vi.fn() }))
const hookHarness = vi.hoisted(() => {
  let effectDependencies: Array<readonly unknown[] | undefined> = []
  let effectIndex = 0
  let effects: Array<() => void | (() => void)> = []
  let refIndex = 0
  let refs: Array<{ current: unknown }> = []
  let state: unknown[] = []
  let stateIndex = 0

  function dependenciesChanged(
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined,
  ): boolean {
    if (!previous || !next || previous.length !== next.length) {
      return true
    }

    return previous.some((value, index) => !Object.is(value, next[index]))
  }

  return {
    beginRender() {
      effectIndex = 0
      refIndex = 0
      stateIndex = 0
    },
    reset() {
      effectDependencies = []
      effectIndex = 0
      effects = []
      refIndex = 0
      refs = []
      state = []
      stateIndex = 0
    },
    runEffects() {
      const pendingEffects = effects
      effects = []
      return pendingEffects.map((effect) => effect())
    },
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
      if (dependenciesChanged(effectDependencies[effectIndex], dependencies)) {
        effects.push(effect)
        effectDependencies[effectIndex] = dependencies ? [...dependencies] : undefined
      }
      effectIndex += 1
    },
    useMemo<T>(factory: () => T) {
      return factory()
    },
    useRef<T>(initialValue: T) {
      const index = refIndex
      refIndex += 1

      if (index === refs.length) {
        refs.push({ current: initialValue })
      }

      return refs[index] as { current: T }
    },
    useState(initialState: unknown) {
      const index = stateIndex
      stateIndex += 1

      if (index === state.length) {
        state.push(
          typeof initialState === 'function'
            ? (initialState as () => unknown)()
            : initialState,
        )
      }

      return [state[index], (nextState: unknown) => {
        state[index] =
          typeof nextState === 'function'
            ? (nextState as (currentState: unknown) => unknown)(state[index])
            : nextState
      }]
    },
  }
})

vi.mock('../services/api', async load => ({ ...await load<typeof import('../services/api')>(), api: requestApi }))
vi.mock('react', async load => ({ ...await load<typeof import('react')>(), useEffect: hookHarness.useEffect, useMemo: hookHarness.useMemo, useRef: hookHarness.useRef, useState: hookHarness.useState, useId: () => 'test-id' }))
interface RenderedElement { props: Record<string, unknown>; type: unknown }
function findRenderedElement(
  node: unknown,
  matches: (element: RenderedElement) => boolean,
): RenderedElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findRenderedElement(child, matches)
      if (match) {
        return match
      }
    }

    return null
  }

  if (
    !node ||
    typeof node !== 'object' ||
    !('props' in node) ||
    !('type' in node) ||
    typeof node.props !== 'object' ||
    node.props === null
  ) {
    return null
  }

  const element: RenderedElement = {
    props: node.props as Record<string, unknown>,
    type: node.type,
  }
  if (matches(element)) {
    return element
  }

  return findRenderedElement(element.props.children, matches)
}

function requireRenderedElement(
  node: unknown,
  matches: (element: RenderedElement) => boolean,
): RenderedElement {
  const element = findRenderedElement(node, matches)

  if (!element) {
    throw new Error('Expected rendered element was not found')
  }

  return element
}



const schema = { formKey: 'psf-request' as const, version: 1, title: 'Request', sections: [] }
const request: PsfRequestResponse = {
  id: 'request-1', requestNo: 'PSF-0001', formKey: 'psf-request', formVersion: 1, status: 'Submitted', requester: 'Requester', requesterUserId: 'requester-1',
  setupOwnerUserId: 'owner-1', setupOwner: 'Same name', setupOwnerRole: 'GNTC', productType: null, requesterData: {}, psfCreatedData: {}, psfCreatedDataVisible: false,
  canEditRequesterData: false, canEditPsfCreatedData: false, canSubmitDraft: false, psfReleasedAt: null, schemaSnapshot: schema,
  psfCreatedInformationSchema: { ...schema, formKey: 'psf-created-information' }, createdAt: 'r1', updatedAt: 'r1', submittedAt: 'r1', psfCreatedAt: null, completedAt: null,
}
const saved = vi.fn(), close = vi.fn()
const render = (snapshot = request, disabled = false) => { hookHarness.beginRender(); return RequestAssignmentDialog({ request: snapshot, open: true, onSaved: saved, onClose: close, disabled }) }
const picker = (page: unknown) => requireRenderedElement(page, e => e.type === RequestAssigneePicker)
const button = (page: unknown, label: string) => requireRenderedElement(page, e => e.type === 'button' && e.props.children === label)
const ready = (page: unknown) => (picker(page).props.onAvailabilityChange as (ready: boolean) => void)(true)
describe('RequestAssignmentDialog', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => { hookHarness.reset(); Object.values(requestApi).forEach(method => method.mockReset()); saved.mockReset(); close.mockReset() })
  it('saves the chosen UUID once, consumes the returned snapshot, and closes', async () => {
    let page = render(); ready(page)
    ;(picker(page).props.onChange as (id: string | null) => void)('owner-2')
    page = render()
    let settle!: (v: PsfRequestResponse) => void
    requestApi.updatePsfRequestAssignment.mockImplementation(() => new Promise(resolve => { settle = resolve }))
    const save = button(page, 'Save assignment').props.onClick as () => Promise<void>
    const pending = save(); void save()
    expect(requestApi.updatePsfRequestAssignment).toHaveBeenCalledTimes(1)
    expect(requestApi.updatePsfRequestAssignment).toHaveBeenCalledWith('request-1', { setupOwnerUserId: 'owner-2', expectedUpdatedAt: 'r1' })
    const result = { ...request, setupOwnerUserId: 'owner-2', updatedAt: 'r2' }
    settle(result); await pending
    expect(saved).toHaveBeenCalledWith(result)
    expect(close).toHaveBeenCalledOnce()
  })
  it('preserves intended selection on conflict, shares latest server context, and retries the latest revision', async () => {
    let page = render(); ready(page)
    ;(picker(page).props.onChange as (id: string | null) => void)(null)
    page = render()
    requestApi.updatePsfRequestAssignment.mockRejectedValueOnce(new ApiError('Conflict', 409, 'Conflict', null))
    const latest = { ...request, setupOwnerUserId: 'owner-3', updatedAt: 'r3' }
    requestApi.fetchPsfRequest.mockResolvedValue(latest)
    await (button(page, 'Save assignment').props.onClick as () => Promise<void>)()
    page = render(latest)
    expect(picker(page).props.value).toBeNull()
    expect(saved).toHaveBeenCalledWith(latest)
    expect(close).not.toHaveBeenCalled()
    requestApi.updatePsfRequestAssignment.mockResolvedValue({ ...latest, setupOwnerUserId: null })
    await (button(page, 'Save assignment').props.onClick as () => Promise<void>)()
    expect(requestApi.updatePsfRequestAssignment).toHaveBeenLastCalledWith('request-1', { setupOwnerUserId: null, expectedUpdatedAt: 'r3' })
  })
  it('cannot save against unknown revision after failed conflict refresh; retains choice', async () => {
    let page = render(); ready(page)
    ;(picker(page).props.onChange as (id: string | null) => void)('owner-2'); page = render()
    requestApi.updatePsfRequestAssignment.mockRejectedValue(new ApiError('Conflict', 409, 'Conflict', null))
    requestApi.fetchPsfRequest.mockRejectedValue(new Error('Offline'))
    await (button(page, 'Save assignment').props.onClick as () => Promise<void>)()
    page = render()
    expect(picker(page).props.value).toBe('owner-2')
    expect(button(page, 'Save assignment').props.disabled).toBe(true)
    expect(requireRenderedElement(page, e => e.type === 'button' && e.props.children === 'Retry revision')).toBeTruthy()
  })
  it('blocks save during directory failure or unrelated edits and cancels by button or Escape', async () => {
    let page = render()
    expect(button(page, 'Save assignment').props.disabled).toBe(true)
    ready(page); page = render(request, true)
    expect(button(page, 'Save assignment').props.disabled).toBe(true)
    await (button(page, 'Save assignment').props.onClick as () => Promise<void>)()
    expect(requestApi.updatePsfRequestAssignment).not.toHaveBeenCalled()
    ;(button(page, 'Cancel').props.onClick as () => void)()
    expect(close).toHaveBeenCalledOnce()
    ;(requireRenderedElement(page, e => e.type === 'dialog').props.onCancel as (e: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() })
    expect(close).toHaveBeenCalledTimes(2)
  })
  it('never clears a legacy recorded owner merely by opening or saving; explicit Unassigned clears it', async () => {
    const legacy = { ...request, setupOwnerUserId: null }
    let page = render(legacy); ready(page); page = render(legacy)
    expect(picker(page).props.value).toBeUndefined()
    expect(button(page, 'Save assignment').props.disabled).toBe(true)
    ;(picker(page).props.onChange as (id: string | null) => void)(null); page = render(legacy)
    requestApi.updatePsfRequestAssignment.mockResolvedValue({ ...legacy, setupOwner: null, setupOwnerRole: null })
    await (button(page, 'Save assignment').props.onClick as () => Promise<void>)()
    expect(requestApi.updatePsfRequestAssignment).toHaveBeenCalledWith('request-1', { setupOwnerUserId: null, expectedUpdatedAt: 'r1' })
  })
  it('opens a modal, focuses Cancel, and returns focus to the trigger on close', () => {
    class TestElement { focus = vi.fn() }
    const trigger = new TestElement()
    vi.stubGlobal('HTMLElement', TestElement)
    vi.stubGlobal('document', { activeElement: trigger })
    const search = { focus: vi.fn() }
    const modal = { open: true, showModal: vi.fn(), close: vi.fn(), querySelector: vi.fn(() => search) }
    const page = render()
    const dialog = requireRenderedElement(page, e => e.type === 'dialog')
    ;(dialog.props.ref as { current: unknown }).current = modal
    const cleanups = hookHarness.runEffects()
    expect(modal.showModal).toHaveBeenCalledOnce()
    expect(modal.querySelector).toHaveBeenCalledWith('[data-dialog-cancel]')
    expect(search.focus).toHaveBeenCalledOnce()
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
    expect(modal.close).toHaveBeenCalledOnce()
    expect(trigger.focus).toHaveBeenCalledOnce()
  })

})
