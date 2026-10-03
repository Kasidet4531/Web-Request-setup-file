import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminWorkflowTransitionPage } from './AdminWorkflowTransitionPage'
import { ApiError } from '../services/api'
import { StatusLabel } from './ui/StatusLabel'

const workflowApi = vi.hoisted(() => ({
  fetchAdminWorkflowTransitionConfiguration: vi.fn(),
  replaceAdminWorkflowTransitionConfiguration: vi.fn(),
}))
const hookState = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  effect: null as (() => void | (() => void)) | null,
  begin() { this.index = 0 },
  reset() { this.states = []; this.index = 0; this.effect = null },
  useState(initial: unknown) {
    const index = this.index++
    if (index === this.states.length) this.states.push(initial)
    return [this.states[index], (next: unknown) => { this.states[index] = next }]
  },
  useEffect(effect: () => void | (() => void)) { this.effect = effect },
}))
vi.mock('../services/api', async (load) => ({ ...(await load<typeof import('../services/api')>()), api: workflowApi }))
vi.mock('react', async (load) => ({ ...(await load<typeof import('react')>()), useState: hookState.useState.bind(hookState), useEffect: hookState.useEffect.bind(hookState) }))

function find(node: unknown, predicate: (node: { type: unknown; props: Record<string, unknown> }) => boolean): { type: unknown; props: Record<string, unknown> } | null {
  if (Array.isArray(node)) { for (const item of node) { const result = find(item, predicate); if (result) return result } return null }
  if (!node || typeof node !== 'object' || !('type' in node) || !('props' in node)) return null
  const element = node as { type: unknown; props: Record<string, unknown> }
  if (predicate(element)) return element
  return find(element.props.children, predicate)
}
const config = {
  statuses: ['5% -- Reject (Information not complete)'],
  entries: [{ id: 'draft-id', name: 'Draft', kind: 'draft', requestCount: null }, { id: 'open-id', name: '5% -- Reject (Information not complete)', kind: 'open', requestCount: 4 }],
  psfVisibilityTriggerId: null,
  updatedAt: '2026-10-01T01:02:03.123456Z',
}

describe('Status Management interactions', () => {
  beforeEach(() => {
    hookState.reset()
    workflowApi.fetchAdminWorkflowTransitionConfiguration.mockReset().mockResolvedValue(config)
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockReset().mockResolvedValue(config)
  })
  it.each([false, true])('deletes the last unused work entry without a request replacement (trigger=%s)', async (trigger) => {
    const unused = { ...config, entries: config.entries.map((entry) => entry.kind === 'draft' ? entry : { ...entry, requestCount: 0 }), psfVisibilityTriggerId: trigger ? 'open-id' : null }
    workflowApi.fetchAdminWorkflowTransitionConfiguration.mockResolvedValue(unused)
    hookState.begin(); AdminWorkflowTransitionPage(); hookState.effect?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    hookState.begin()
    const page = AdminWorkflowTransitionPage()
    const remove = find(page, (element) => element.type === 'button' && element.props.children === 'Delete')!
    ;(remove.props.onClick as () => void)()
    hookState.begin()
    const confirmation = find(AdminWorkflowTransitionPage(), (element) => element.type === 'button' && (element.props.children === 'Delete status' || element.props.children === 'Replace and delete'))!
    expect(confirmation.props.disabled).toBe(false)
    expect(confirmation.props.children).toBe('Delete status')
    ;(confirmation.props.onClick as () => void)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledExactlyOnceWith({ action: 'delete', id: 'open-id', expectedUpdatedAt: config.updatedAt, ...(trigger ? { replacementTriggerId: null } : {}) })
  })

  it('requires an explicit surviving nonDraft replacement for used deletion and resets selection after 409', async () => {
    const withReplacement = { ...config, entries: [...config.entries, { id: 'other-id', name: 'Other work', kind: 'open', requestCount: 0 }], psfVisibilityTriggerId: 'open-id' }
    workflowApi.fetchAdminWorkflowTransitionConfiguration.mockResolvedValue(withReplacement)
    hookState.begin(); AdminWorkflowTransitionPage(); hookState.effect?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const render = () => { hookState.begin(); return AdminWorkflowTransitionPage() }
    ;(find(render(), (element) => element.type === 'button' && element.props.children === 'Delete')!.props.onClick as () => void)()
    const confirm = () => find(render(), (element) => element.type === 'button' && (element.props.children === 'Delete status' || element.props.children === 'Replace and delete'))!
    expect(confirm().props.disabled).toBe(true)
    const replacement = find(render(), (element) => element.type === 'select' && element.props.value === '')!
    ;(replacement.props.onChange as (event: unknown) => void)({ target: { value: 'draft-id' } })
    expect(confirm().props.disabled).toBe(true)
    ;(replacement.props.onChange as (event: unknown) => void)({ target: { value: 'other-id' } })
    expect(confirm().props.disabled).toBe(false)
    const trigger = find(render(), (element) => element.type === 'label' && find(element.props.children, (child) => child.type === 'span' && child.props.children === 'Replace visibility trigger') !== null)!
    const triggerSelect = find(trigger, (element) => element.type === 'select')!
    ;(triggerSelect.props.onChange as (event: unknown) => void)({ target: { value: 'other-id' } })
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockRejectedValue(new ApiError('Stale catalog', 409, 'Conflict', null))
    ;(confirm().props.onClick as () => void)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledWith({ action: 'delete', id: 'open-id', replacementId: 'other-id', replacementTriggerId: 'other-id', expectedUpdatedAt: config.updatedAt })
    expect(find(render(), (element) => element.props['aria-labelledby'] === 'delete-status-heading')).toBeNull()
    expect(workflowApi.fetchAdminWorkflowTransitionConfiguration).toHaveBeenCalledTimes(2)
  })

  it('shows protected Draft and exact labels, then creates with the opaque revision', async () => {
    hookState.begin()
    AdminWorkflowTransitionPage()
    hookState.effect?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    hookState.begin()
    const page = AdminWorkflowTransitionPage()
    expect(find(page, (element) => element.type === 'span' && element.props.children === 'Protected')).not.toBeNull()
    expect(find(page, (element) => element.type === StatusLabel && element.props.status === config.entries[1].name && element.props.kind === 'open')).not.toBeNull()
    const input = find(page, (element) => element.type === 'input')
    const form = find(page, (element) => element.type === 'form')
    if (!input || typeof input.props.onChange !== 'function' || !form || typeof form.props.onSubmit !== 'function') throw new Error('Expected new-status form controls')
    input.props.onChange({ target: { value: 'New lane' } })
    hookState.begin()
    const updatedPage = AdminWorkflowTransitionPage()
    const updatedForm = find(updatedPage, (element) => element.type === 'form')
    if (!updatedForm || typeof updatedForm.props.onSubmit !== 'function') throw new Error('Expected form submit handler')
    updatedForm.props.onSubmit({ preventDefault() {} })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledWith({ action: 'create', name: 'New lane', kind: 'open', expectedUpdatedAt: config.updatedAt })
  })
})
