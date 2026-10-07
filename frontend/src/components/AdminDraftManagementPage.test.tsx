import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHookHarness, findRenderedElement, requireRenderedElement } from '../test-utils/componentHarness'
import { AdminDraftDetailPage, AdminDraftTable, AdminDraftManagementPage } from './AdminDraftManagementPage'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import type { AdminDraftListItem, PsfRequestResponse } from '../services/api'
const hooks = vi.hoisted(() => ({ current: null as ReturnType<typeof createHookHarness> | null }))
const service = vi.hoisted(() => ({ fetchAdminDraft: vi.fn(), fetchAdminDrafts: vi.fn(), fetchDraftReminders: vi.fn(), fetchDraftDeletions: vi.fn() }))
vi.mock('../services/api', async load => ({ ...await load<typeof import('../services/api')>(), api: service }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: { children?: React.ReactNode; to: string }) => <a href={to}>{children}</a>, useParams: () => ({ requestId: 'draft-1' }), useNavigate: () => vi.fn() }))
vi.mock('react', async load => ({ ...await load<typeof import('react')>(), useState: (value: unknown) => hooks.current!.useState(value), useEffect: (effect: () => void, deps: unknown[]) => hooks.current!.useEffect(effect, deps), useRef: <T,>(value: T) => hooks.current!.useRef(value) }))
const item: AdminDraftListItem = { requestId: 'draft-1', requestNo: 'PSF-1', title: 'Unfinished setup', requester: 'Creator', requesterUserId: 'creator', productType: 'Custom Product', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' }
const schema = { formKey: 'psf-request', version: 1, title: 'Request', sections: [] }
const draft = { ...item, id: item.requestId, status: 'Draft', canEditRequesterData: true, canSubmitDraft: true, schemaSnapshot: schema, requesterData: { title: 'Private content' }, psfCreatedDataVisible: false } as unknown as PsfRequestResponse
function renderDetail() { hooks.current!.beginRender(); return AdminDraftDetailPage() }
function renderList() { hooks.current!.beginRender(); return AdminDraftManagementPage() }
async function settle() { await new Promise(resolve => setTimeout(resolve, 0)) }
describe('Draft Management public UI', () => {
 beforeEach(() => { hooks.current = createHookHarness(); service.fetchAdminDraft.mockResolvedValue(draft); service.fetchAdminDrafts.mockResolvedValue({ items: [item], total: 1, limit: 25, offset: 0 }); service.fetchDraftReminders.mockResolvedValue({ items: [] }); service.fetchDraftDeletions.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 }) })
 it('presents creator, creation/update times, unclassified product and recipient issues', () => {
  const markup = renderToStaticMarkup(<AdminDraftTable items={[item]} reminders={[{ requestId: 'draft-1', requestNo: 'PSF-1', state: 'unresolved', queuedAt: null, skippedRecipients: [{ userId: 'creator', displayName: 'Creator', reason: 'Missing email' }] }]} onDelete={() => {}} />)
  expect(markup).toContain('Creator'); expect(markup).toContain('รอระบุ Product Type'); expect(markup).toContain('Missing email'); expect(markup).toContain('unresolved'); expect(markup).not.toContain('Owner / Dept')
 })
 it('keeps management detail read only even if a response incorrectly advertises mutation access', async () => {
  renderDetail(); hooks.current!.runEffects(); await settle(); const page = renderDetail()
  const form = requireRenderedElement(page, element => element.type === DynamicFormRenderer)
  expect(form.props.readOnly).toBe(true); expect(form.props.onSubmit).toBeUndefined(); expect(form.props.onChange).toBeUndefined()
  expect(findRenderedElement(page, element => element.type === 'button' && ['Edit information', 'Submit request'].includes(String(element.props.children)))).toBeNull()
  expect(findRenderedElement(page, element => element.type === 'button' && element.props.children === 'Delete Draft')).not.toBeNull()
 })
 it('removes Delete if the detail response is no longer a Draft', async () => {
  service.fetchAdminDraft.mockResolvedValue({ ...draft, status: 'Submitted' }); renderDetail(); hooks.current!.runEffects(); await settle()
  expect(findRenderedElement(renderDetail(), element => element.type === 'button' && element.props.children === 'Delete Draft')).toBeNull()
 })
 it('requires committing search before replacing the visible list query', async () => {
  const matchingItem = { ...item, title: 'Alex Draft' }
  service.fetchAdminDrafts.mockImplementation((query: { creator?: string }) => Promise.resolve({ items: query.creator === 'Alex' ? [matchingItem] : [item], total: 1, limit: 25, offset: 0 }))
  renderList(); hooks.current!.runEffects(); await settle(); let page = renderList()
  const creator = requireRenderedElement(page, element => element.type === 'input' && element.props.placeholder === 'Creator name…')
  ;(creator.props.onChange as (event: unknown) => void)({ target: { value: 'Alex' } }); page = renderList()
  expect(requireRenderedElement(page, element => element.type === AdminDraftTable).props.items).toEqual([item])
  const form = requireRenderedElement(page, element => element.type === 'form')
  ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); renderList(); hooks.current!.runEffects(); await settle()
  expect(requireRenderedElement(renderList(), element => element.type === AdminDraftTable).props.items).toEqual([matchingItem])
 })
})
