import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminWorkflowTransitionPage } from './AdminWorkflowTransitionPage'
import { ApiError } from '../services/api'
import { StatusLabel } from './ui/StatusLabel'

const workflowApi = vi.hoisted(() => ({
  fetchAdminWorkflowTransitionConfiguration: vi.fn(),
  fetchAdminUsers: vi.fn(),
  replaceAdminWorkflowTransitionConfiguration: vi.fn(),
}))
const hookState = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  effectIndex: 0,
  effectDependencies: [] as Array<readonly unknown[] | undefined>,
  pendingEffects: [] as Array<() => void | (() => void)>,
  effect() { this.pendingEffects.splice(0).forEach((effect) => effect()) },
  begin() { this.index = 0; this.refIndex = 0; this.effectIndex = 0 },
  reset() { this.states = []; this.index = 0; this.refs = []; this.refIndex = 0; this.effectIndex = 0; this.effectDependencies = []; this.pendingEffects = [] },
  useState(initial: unknown) {
    const index = this.index++
    if (index === this.states.length) this.states.push(initial)
    return [this.states[index], (next: unknown) => { this.states[index] = next }]
  },
  useRef(initial: unknown) {
    const index = this.refIndex++
    if (!this.refs[index]) this.refs[index] = { current: initial }
    return this.refs[index]
  },
  useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
    const index = this.effectIndex++
    const previous = this.effectDependencies[index]
    if (!previous || !dependencies || previous.length !== dependencies.length || dependencies.some((value, position) => !Object.is(value, previous[position]))) {
      this.pendingEffects.push(effect)
      this.effectDependencies[index] = dependencies
    }
  },
}))
vi.mock('../services/api', async (load) => ({ ...(await load<typeof import('../services/api')>()), api: workflowApi }))
vi.mock('react', async (load) => ({ ...(await load<typeof import('react')>()), useState: hookState.useState.bind(hookState), useRef: hookState.useRef.bind(hookState), useEffect: hookState.useEffect.bind(hookState) }))

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
    workflowApi.fetchAdminUsers.mockReset().mockResolvedValue([{ id: "user-id", username: "alex", displayName: "Alex", role: "requester", setupOwnerDepartment: null, email: "Alex@example.com" }, { id: "no-email", username: "sam", displayName: "Sam", role: "requester", setupOwnerDepartment: null, email: null }])
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockReset().mockResolvedValue(config)
  })
  it('opens status name and recipient editing in one modal', async () => {
    render(); hookState.effect(); await flush()
    const edit = control(`Edit ${config.entries[1].name}`)
    ;(edit.props.onClick as () => void)(); await flush()
    const dialog = find(render(), (element) => element.type === 'dialog' && element.props['aria-labelledby'] === 'edit-status-heading')
    expect(dialog).not.toBeNull()
    expect(find(dialog, (element) => element.props['aria-label'] === 'Status name')?.props.value).toBe(config.entries[1].name)
    expect(find(dialog, (element) => element.props['aria-label'] === 'To addresses')).not.toBeNull()
    expect(find(dialog, (element) => element.props['aria-label'] === 'CC addresses')).not.toBeNull()
  })

  it('keeps both recipient input groups before selected lists as To grows', async () => {
    await openEmailEditor(enabledConfig)
    add('To', 'one@example.com,two@example.com,three@example.com')
    const order: string[] = []
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(visit); return }
      if (!node || typeof node !== 'object' || !('props' in node)) return
      const props = (node as { props: Record<string, unknown> }).props
      if (typeof props['aria-label'] === 'string') order.push(props['aria-label'])
      visit(props.children)
    }
    visit(render())
    for (const input of ['To addresses', 'CC addresses', 'Add system user to To', 'Add system user to CC']) {
      expect(order.indexOf(input)).toBeLessThan(order.indexOf('To recipients'))
      expect(order.indexOf(input)).toBeLessThan(order.indexOf('CC recipients'))
    }
    expect(control('Remove three@example.com from To')).not.toBeNull()
    ;(control('Remove three@example.com from To').props.onClick as () => void)()
    expect(control('CC addresses').props.value).toBe('')
  })

  it('adds and removes recipient chips, then saves name and policy in one request', async () => {
    render(); hookState.effect(); await flush()
    ;(control(`Edit ${config.entries[1].name}`).props.onClick as () => void)(); await flush()
    suppress(false)
    change('Status name', 'Renamed work')
    change('To addresses', 'TEAM@example.com')
    ;(button('Add To').props.onClick as () => void)()
    expect(control('To addresses').props.value).toBe('')
    expect(control('Remove team@example.com from To')).not.toBeNull()
    change('To addresses', 'remove@example.com')
    ;(button('Add To').props.onClick as () => void)()
    ;(control('Remove remove@example.com from To').props.onClick as () => void)()
    change('CC addresses', 'lead@example.com')
    ;(button('Add CC').props.onClick as () => void)()
    ;(button('Save changes').props.onClick as () => void)(); await flush()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledExactlyOnceWith({
      action: 'rename', id: 'open-id', name: 'Renamed work', psfAccessTrigger: false, emailPolicy: { enabled: true, to: ['team@example.com'], cc: ['lead@example.com'] }, expectedUpdatedAt: config.updatedAt,
    })
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
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledExactlyOnceWith({ action: 'delete', id: 'open-id', expectedUpdatedAt: config.updatedAt })
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
    expect(find(render(), (element) => element.type === 'label' && find(element.props.children, (child) => child.type === 'span' && child.props.children === 'Replace visibility trigger') !== null)).toBeNull()
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockRejectedValue(new ApiError('Stale catalog', 409, 'Conflict', null))
    ;(confirm().props.onClick as () => void)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledWith({ action: 'delete', id: 'open-id', replacementId: 'other-id', expectedUpdatedAt: config.updatedAt })
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


const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const render = () => { hookState.begin(); return AdminWorkflowTransitionPage() }
function control(label: string) {
  const result = find(render(), (element) => element.props['aria-label'] === label)
  if (!result) throw new Error(`Missing control: ${label}`)
  return result
}
function button(label: string) {
  const result = find(render(), (element) => element.type === 'button' && (element.props.children === label || element.props['aria-label'] === label))
  if (!result) throw new Error(`Missing button: ${label}`)
  return result
}
function change(label: string, value: string) {
  ;(control(label).props.onChange as (event: unknown) => void)({ target: { value } })
}
async function openEmailEditor(configuration: Omit<typeof config, 'psfVisibilityTriggerId'> & { psfVisibilityTriggerId: string | null } = config) {
  workflowApi.fetchAdminWorkflowTransitionConfiguration.mockResolvedValue(configuration)
  render(); hookState.effect?.(); await flush()
  const edit = find(render(), (element) => element.type === 'button' && element.props['aria-label'] === `Edit ${config.entries[1].name}`)
  expect(edit, 'A non-Draft status must expose email editing').not.toBeNull()
  ;(edit!.props.onClick as () => void)(); await flush()
}
function add(field: 'To' | 'CC', value: string) {
  change(`${field} addresses`, value)
  ;(button(`Add ${field}`).props.onClick as () => void)()
}
function suppress(checked: boolean) {
  ;(control('Do not send email on entry').props.onChange as (event: unknown) => void)({ target: { checked } })
}
const enabledConfig = { ...config, entries: config.entries.map((entry) => ({ ...entry, emailPolicy: { enabled: entry.kind !== 'draft', to: ['team@example.com'], cc: ['lead@example.com'] } })) }

describe('Status email policy interactions', () => {
  beforeEach(() => {
    hookState.reset()
    workflowApi.fetchAdminWorkflowTransitionConfiguration.mockReset().mockResolvedValue(config)
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockReset().mockResolvedValue(config)
    workflowApi.fetchAdminUsers.mockReset().mockResolvedValue([{ id: 'alex', username: 'alex', displayName: 'Alex', role: 'requester', setupOwnerDepartment: null, email: 'Alex@example.com' }, { id: 'sam', username: 'sam', displayName: 'Sam', role: 'requester', setupOwnerDepartment: null, email: null }])
  })


  it.each([
    ['entry flag', { psfVisibilityTriggerIds: ['open-id'], entries: config.entries.map((entry) => ({ ...entry, psfAccessTrigger: false })) }, false],
    ['multiple trigger ids', { psfVisibilityTriggerIds: ['open-id', 'other-id'] }, true],
    ['empty trigger ids over legacy scalar', { psfVisibilityTriggerIds: [], psfVisibilityTriggerId: 'open-id' }, false],
    ['legacy scalar', { psfVisibilityTriggerId: 'open-id' }, true],
  ])('initializes the PSF access checkbox from %s', async (_label, fields, checked) => {
    await openEmailEditor({ ...config, ...fields })
    expect(control('Allow requesters to view PSF Created Information').props.checked).toBe(checked)
  })

  it('saves PSF access together with name and recipients without changing another trigger', async () => {
    const multiple = { ...enabledConfig, psfVisibilityTriggerIds: ['other-id'], entries: [...enabledConfig.entries, { id: 'other-id', name: 'Other work', kind: 'open', requestCount: 0, psfAccessTrigger: true }] }
    await openEmailEditor(multiple)
    change('Status name', 'New name')
    ;(control('Allow requesters to view PSF Created Information').props.onChange as (event: unknown) => void)({ target: { checked: true } })
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
    ;(button('Save changes').props.onClick as () => void)(); await flush()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledExactlyOnceWith({ action: 'rename', id: 'open-id', name: 'New name', psfAccessTrigger: true, emailPolicy: { enabled: true, to: ['team@example.com'], cc: ['lead@example.com'] }, expectedUpdatedAt: config.updatedAt })
  })

  it('cancels an unsaved trigger change and reloads its persisted value', async () => {
    await openEmailEditor()
    ;(control('Allow requesters to view PSF Created Information').props.onChange as (event: unknown) => void)({ target: { checked: true } })
    ;(button('Cancel').props.onClick as () => void)()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
    ;(control(`Edit ${config.entries[1].name}`).props.onClick as () => void)(); await flush()
    expect(control('Allow requesters to view PSF Created Information').props.checked).toBe(false)
  })

  it('keeps the combined edits open when required PSF data blocks release', async () => {
    await openEmailEditor(enabledConfig)
    change('Status name', 'Pending name')
    add('To', 'added@example.com')
    ;(control('Allow requesters to view PSF Created Information').props.onChange as (event: unknown) => void)({ target: { checked: true } })
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockRejectedValue(new ApiError('Required PSF fields are incomplete.', 400, 'Bad Request', null))
    ;(button('Save changes').props.onClick as () => void)(); await flush()
    expect(control('Status name').props.value).toBe('Pending name')
    expect(control('Allow requesters to view PSF Created Information').props.checked).toBe(true)
    expect(control('Remove added@example.com from To')).not.toBeNull()
    expect(find(render(), (element) => element.props.title === 'Required PSF fields are incomplete.')).not.toBeNull()
    expect(button('Save changes').props.disabled).toBe(false)
  })

  it('defaults legacy policies to off and keeps Draft protected', async () => {
    await openEmailEditor()
    expect(control('Do not send email on entry').props.checked).toBe(true)
    expect(control('To addresses').props.disabled).toBe(true)
    expect(control('CC addresses').props.disabled).toBe(true)
    expect(find(render(), (element) => element.props['aria-label'] === 'Edit Draft')).toBeNull()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
  })

  it('combines manually entered group addresses and directory emails only on explicit save', async () => {
    await openEmailEditor()
    suppress(false)
    add('To', ' Team@EXAMPLE.com, team@example.com; other@example.com ')
    change('Add system user to To', 'Alex@example.com')
    add('CC', 'Team@example.com; Lead@example.com, lead@example.com')
    change('Add system user to CC', 'Alex@example.com')
    expect(control('Remove alex@example.com from To')).not.toBeNull()
    const missingUser = find(control('Add system user to To'), (element) => element.type === 'option' && element.props.disabled === true)
    expect(missingUser).not.toBeNull()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
    ;(button('Save changes').props.onClick as () => void)(); await flush()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledExactlyOnceWith({ action: 'rename', id: 'open-id', name: config.entries[1].name, psfAccessTrigger: false, emailPolicy: { enabled: true, to: ['team@example.com', 'other@example.com', 'alex@example.com'], cc: ['lead@example.com'] }, expectedUpdatedAt: config.updatedAt })
    expect(find(render(), (element) => element.props['aria-labelledby'] === 'edit-status-heading')).toBeNull()
  })

  it('suppresses delivery while retaining all recipient values and supports re-enabling', async () => {
    await openEmailEditor(enabledConfig)
    suppress(true)
    expect(control('Remove team@example.com from To')).not.toBeNull()
    expect(control('Remove lead@example.com from CC')).not.toBeNull()
    expect(control('Add system user to CC').props.disabled).toBe(true)
    suppress(false)
    expect(control('To addresses').props.disabled).toBe(false)
    suppress(true)
    ;(button('Save changes').props.onClick as () => void)(); await flush()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledWith({ action: 'rename', id: 'open-id', name: config.entries[1].name, psfAccessTrigger: false, emailPolicy: { enabled: false, to: ['team@example.com'], cc: ['lead@example.com'] }, expectedUpdatedAt: config.updatedAt })
  })

  it.each([['', 'At least one To address is required'], ['not-an-email', 'Enter valid email addresses'], ['valid@example.com', 'Enter valid email addresses']])('rejects empty or invalid enabled recipients (%s)', async (to, message) => {
    await openEmailEditor()
    suppress(false)
    add('To', to)
    if (to === 'valid@example.com') add('CC', 'bad-address')
    if (to) expect(find(render(), (element) => element.props.role === 'alert' && String(element.props.children).includes(message))).not.toBeNull()
    ;(button('Save changes').props.onClick as () => void)(); await flush()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
    expect(find(render(), (element) => element.props.role === 'alert' && String(element.props.children).includes(to ? 'Click Add' : message))).not.toBeNull()
  })

  it('requires Add before saving typed recipients and supports Enter to add', async () => {
    await openEmailEditor()
    suppress(false)
    change('To addresses', 'team@example.com')
    ;(button('Save changes').props.onClick as () => void)()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
    expect(find(render(), (element) => element.props.role === 'alert' && String(element.props.children).includes('Click Add'))).not.toBeNull()
    const preventDefault = vi.fn()
    ;(control('To addresses').props.onKeyDown as (event: unknown) => void)({ key: 'Enter', preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(control('Remove team@example.com from To')).not.toBeNull()
    expect(control('To addresses').props.value).toBe('')
  })

  it('uses a replacement modal and allows Escape to cancel without changing data', async () => {
    render(); hookState.effect(); await flush()
    ;(button('Delete').props.onClick as () => void)()
    const dialog = find(render(), (element) => element.type === 'dialog' && element.props['aria-labelledby'] === 'delete-status-heading')!
    expect(dialog).not.toBeNull()
    const preventDefault = vi.fn()
    ;(dialog.props.onCancel as (event: unknown) => void)({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(find(render(), (element) => element.type === 'dialog')).toBeNull()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
  })

  it('cancels unsaved edits without persisting them', async () => {
    await openEmailEditor(enabledConfig)
    add('To', 'changed@example.com')
    ;(button('Cancel').props.onClick as () => void)()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
    expect(find(render(), (element) => element.props['aria-labelledby'] === 'edit-status-heading')).toBeNull()
    ;(control(`Edit ${config.entries[1].name}`).props.onClick as () => void)(); await flush()
    expect(control('Remove team@example.com from To')).not.toBeNull()
  })

  it('blocks duplicate saves while busy and preserves edits on a server error', async () => {
    await openEmailEditor(enabledConfig)
    let reject!: (error: Error) => void
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockImplementation(() => new Promise((_, rejectPromise) => { reject = rejectPromise }))
    add('To', 'changed@example.com')
    ;(button('Save changes').props.onClick as () => void)()
    expect(button('Saving…').props.disabled).toBe(true)
    expect(control('To addresses').props.disabled).toBe(true)
    expect(control('Allow requesters to view PSF Created Information').props.disabled).toBe(true)
    expect(button('Cancel').props.disabled).toBe(true)
    reject(new Error('Unable to save')); await flush()
    expect(control('Remove changed@example.com from To')).not.toBeNull()
    expect(button('Save changes').props.disabled).toBe(false)
    expect(find(render(), (element) => element.props.title === 'Unable to save')).not.toBeNull()
  })

  it('refreshes the catalog and closes stale policy editing on conflict', async () => {
    await openEmailEditor(enabledConfig)
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockRejectedValue(new ApiError('Stale email policy', 409, 'Conflict', null))
    ;(button('Save changes').props.onClick as () => void)(); await flush()
    expect(workflowApi.fetchAdminWorkflowTransitionConfiguration).toHaveBeenCalledTimes(2)
    expect(find(render(), (element) => element.props['aria-labelledby'] === 'edit-status-heading')).toBeNull()
    expect(find(render(), (element) => element.props.title === 'Stale email policy')).not.toBeNull()
  })

  it('keeps manual recipients usable when the directory cannot load', async () => {
    workflowApi.fetchAdminUsers.mockRejectedValue(new Error('Directory unavailable'))
    await openEmailEditor(enabledConfig)
    expect(control('To addresses').props.disabled).toBe(false)
    expect(control('Add system user to To').props.disabled).toBe(true)
    expect(find(render(), (element) => element.props.role === 'status' && String(element.props.children).includes('Directory unavailable'))).not.toBeNull()
  })

  it('shows every affected request and destination delivery recipients before bulk deletion', async () => {
    const replacementConfig = { ...enabledConfig, entries: [...enabledConfig.entries, { id: 'replacement', name: 'Other work', kind: 'open', requestCount: 0, emailPolicy: { enabled: true, to: ['destination@example.com'], cc: ['copy@example.com'] } }] }
    workflowApi.fetchAdminWorkflowTransitionConfiguration.mockResolvedValue(replacementConfig)
    render(); hookState.effect?.(); await flush()
    ;(button('Delete').props.onClick as () => void)()
    const replacement = find(render(), (element) => element.type === 'label' && find(element.props.children, (child) => child.type === 'span' && child.props.children === 'Replacement status') !== null)!
    ;(find(replacement, (element) => element.type === 'select')!.props.onChange as (event: unknown) => void)({ target: { value: 'replacement' } })
    expect(find(render(), (element) => element.type === 'p' && String(element.props.children).includes('One email will be queued for each of the 4 affected requests'))).not.toBeNull()
    expect(find(render(), (element) => element.type === 'p' && String(element.props.children).includes('destination@example.com'))).not.toBeNull()
    expect(find(render(), (element) => element.type === 'p' && String(element.props.children).includes('copy@example.com'))).not.toBeNull()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).not.toHaveBeenCalled()
  })
  it('shows disabled destination delivery when the replacement has a legacy missing policy', async () => {
    workflowApi.fetchAdminWorkflowTransitionConfiguration.mockResolvedValue({ ...config, entries: [...config.entries, { id: 'legacy', name: 'Legacy status', kind: 'open', requestCount: 0 }] })
    render(); hookState.effect?.(); await flush()
    ;(button('Delete').props.onClick as () => void)()
    const replacement = find(render(), (element) => element.type === 'label' && find(element.props.children, (child) => child.type === 'span' && child.props.children === 'Replacement status') !== null)!
    ;(find(replacement, (element) => element.type === 'select')!.props.onChange as (event: unknown) => void)({ target: { value: 'legacy' } })
    expect(find(render(), (element) => element.type === 'p' && String(element.props.children).includes('No notification emails will be queued'))).not.toBeNull()
    expect(button('Replace and delete').props.disabled).toBe(false)
  })

  it.each(['   ', 'not-an-email', 'one@example.com,two@example.com', 'one@example.com;two@example.com', 'one@example.com\ntwo@example.com', 'one..two@example.com', 'one@-example.com'])('makes unusable directory address %j unavailable in both pickers', async (email) => {
    workflowApi.fetchAdminUsers.mockResolvedValue([{ id: 'unusable', username: 'unusable', displayName: 'Unavailable person', role: 'requester', setupOwnerDepartment: null, email }])
    await openEmailEditor(enabledConfig)
    for (const field of ['To', 'CC']) {
      const option = find(control(`Add system user to ${field}`), (element) => element.type === 'option' && String(element.props.children).includes('Unavailable person'))!
      expect(option.props.disabled).toBe(true)
      expect(String(option.props.children)).toContain('No valid email available')
      change(`Add system user to ${field}`, email)
    }
    expect(control('Remove team@example.com from To')).not.toBeNull()
    expect(control('Remove lead@example.com from CC')).not.toBeNull()
    ;(button('Save changes').props.onClick as () => void)(); await flush()
    expect(workflowApi.replaceAdminWorkflowTransitionConfiguration).toHaveBeenCalledWith({ action: 'rename', id: 'open-id', name: config.entries[1].name, psfAccessTrigger: false, emailPolicy: { enabled: true, to: ['team@example.com'], cc: ['lead@example.com'] }, expectedUpdatedAt: config.updatedAt })
  })

  it.each(['cancel', 'save', 'conflict'])('restores focus to the originating status after %s closes the editor', async (action) => {
    await openEmailEditor(enabledConfig)
    const origin = { isConnected: true, disabled: false, focus: vi.fn() }
    const opener = control(`Edit ${config.entries[1].name}`)
    expect(typeof opener.props.ref).toBe('function')
    ;(opener.props.ref as (node: unknown) => void)(origin)
    if (action === 'conflict') workflowApi.replaceAdminWorkflowTransitionConfiguration.mockRejectedValue(new ApiError('Stale email policy', 409, 'Conflict', null))
    ;(button(action === 'cancel' ? 'Cancel' : 'Save changes').props.onClick as () => void)()
    await flush(); render(); hookState.effect()
    expect(origin.focus).toHaveBeenCalledTimes(1)
    render(); hookState.effect()
    expect(origin.focus).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the catalog when the original status row disappears after conflict', async () => {
    await openEmailEditor(enabledConfig)
    const origin = { isConnected: false, disabled: false, focus: vi.fn() }
    const fallback = { focus: vi.fn() }
    const opener = control(`Edit ${config.entries[1].name}`)
    expect(typeof opener.props.ref).toBe('function')
    ;(opener.props.ref as (node: unknown) => void)(origin)
    const regionRef = control('Status catalog').props.ref as { current: unknown }
    expect(regionRef).toBeDefined()
    regionRef.current = fallback
    workflowApi.fetchAdminWorkflowTransitionConfiguration.mockResolvedValue({ ...config, entries: [config.entries[0]] })
    workflowApi.replaceAdminWorkflowTransitionConfiguration.mockRejectedValue(new ApiError('Stale email policy', 409, 'Conflict', null))
    ;(button('Save changes').props.onClick as () => void)()
    await flush(); render(); hookState.effect()
    expect(origin.focus).not.toHaveBeenCalled()
    expect(fallback.focus).toHaveBeenCalledTimes(1)
  })

})
