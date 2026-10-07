import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHookHarness } from '../test-utils/componentHarness'
import { DraftDeleteDialog } from './DraftDeleteDialog'
const harness = vi.hoisted(() => ({ current: null as ReturnType<typeof createHookHarness> | null }))
const backend = vi.hoisted(() => ({ remove: vi.fn() }))
vi.mock('../services/api', () => ({ api: { deleteDraft: backend.remove } }))
vi.mock('react', async load => ({ ...await load<typeof import('react')>(), useRef: <T,>(value: T) => harness.current!.useRef(value), useState: (value: unknown) => harness.current!.useState(value) }))
const draft = { requestId: 'draft-1', requestNo: 'PSF-1', title: 'Unfinished request', updatedAt: 'r1' }
function render(onDeleted = vi.fn()) { harness.current!.beginRender(); return DraftDeleteDialog({ draft, onCancel: vi.fn(), onDeleted }) }
describe('Draft deletion confirmation', () => {
 beforeEach(() => { harness.current = createHookHarness(); backend.remove.mockReset() })
 it('identifies permanent deletion and preserves the confirmation with a server error', async () => {
  backend.remove.mockRejectedValue(new Error('Draft changed. Reload before deleting.'))
  let page = render(); expect(page.props.title).toContain('PSF-1')
  page.props.onConfirm(); await new Promise(resolve => setTimeout(resolve, 0)); page = render()
  expect(JSON.stringify(page.props.description)).toContain('Draft changed. Reload before deleting.')
  expect(page.props.open).toBe(true)
 })
 it('blocks duplicate deletion and closes only after the server succeeds', async () => {
  let finish!: () => void; backend.remove.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  const deleted = vi.fn(); const page = render(deleted); page.props.onConfirm(); page.props.onConfirm()
  expect(deleted).not.toHaveBeenCalled(); expect(render(deleted).props.pending).toBe(true)
  finish(); await new Promise(resolve => setTimeout(resolve, 0)); expect(deleted).toHaveBeenCalledOnce()
 })
})
