import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestAssigneePicker } from './RequestAssigneePicker'
const requestApi = vi.hoisted(() => ({ fetchRequestAssignees: vi.fn() }))
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
      pendingEffects.forEach((effect) => effect())
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


const render = (value: string | null | undefined = 'owner-1', onChange = vi.fn()) => { hookHarness.beginRender(); return RequestAssigneePicker({ value, onChange, recordedOwner: 'Saved owner / GNTC' }) }
const find = (page: unknown, label: string) => requireRenderedElement(page, e => e.props['aria-label'] === label)
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
describe('RequestAssigneePicker', () => {
  beforeEach(() => { hookHarness.reset(); requestApi.fetchRequestAssignees.mockReset().mockResolvedValue({ items: [{ id: 'owner-1', displayName: 'Same name', setupOwnerDepartment: 'GNTC' }, { id: 'owner-2', displayName: 'Same name', setupOwnerDepartment: 'MFG' }] }) })
  it('uses UUID option values, searches name/Dept, retains selected option during search, and clears explicitly', async () => {
    const change = vi.fn()
    render(); hookHarness.runEffects(); await flush()
    let page = render('owner-1', change)
    let select = find(page, 'Setup owner')
    expect((select.props.children as RenderedElement[]).flat(Infinity).map(e => e?.props?.value)).toContain('owner-2')
    ;(find(page, 'Search setup owners').props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'MFG' } })
    page = render('owner-1', change); select = find(page, 'Setup owner')
    expect(JSON.stringify(select)).toContain('GNTC')
    expect(JSON.stringify(select)).toContain('MFG')
    ;(select.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'owner-2' } })
    expect(change).toHaveBeenLastCalledWith('owner-2')
    ;(select.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: '' } })
    expect(change).toHaveBeenLastCalledWith(null)
  })
  it.each([new Error('Directory offline'), { items: [{ id: 'wrong', displayName: 'Invalid', setupOwnerDepartment: 'Other' }] }])('retains selection when directory fails or is invalid and retries', async result => {
    if (result instanceof Error) requestApi.fetchRequestAssignees.mockRejectedValueOnce(result)
    else requestApi.fetchRequestAssignees.mockResolvedValueOnce(result)
    render(); hookHarness.runEffects(); await flush()
    let page = render()
    expect(find(page, 'Setup owner').props.value).toBe('owner-1')
    expect(find(page, 'Setup owner').props.disabled).toBe(true)
    const retry = requireRenderedElement(page, e => e.type === 'button' && e.props.children === 'Retry')
    ;(retry.props.onClick as () => void)()
    render(); hookHarness.runEffects(); await flush(); page = render()
    expect(find(page, 'Setup owner').props.disabled).toBe(false)
  })
  it('keeps a legacy recorded owner as a distinct preserve option rather than Unassigned', async () => {
    hookHarness.beginRender(); RequestAssigneePicker({ value: undefined, onChange: vi.fn(), recordedOwner: 'Saved owner / GNTC' }); hookHarness.runEffects(); await flush()
    hookHarness.beginRender(); const page = RequestAssigneePicker({ value: undefined, onChange: vi.fn(), recordedOwner: 'Saved owner / GNTC' })
    expect(find(page, 'Setup owner').props.value).not.toBe('')
    expect(JSON.stringify(page)).toContain('Saved owner / GNTC')
  })
})
