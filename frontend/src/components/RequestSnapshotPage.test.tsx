import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestSnapshotPage, RequestSnapshotView } from './RequestSnapshotPage'
import { Route as SnapshotRoute } from '../routes/requests/$requestId/history_.$entryId'
import { AsyncNotice } from './ui/AsyncNotice'
import { PageHeader } from './ui/PageHeader'
import { Link } from '@tanstack/react-router'
import type { RequestSnapshotResponse } from '../services/api'
import type { FormSchema } from '../types/forms'
import { createHookHarness, findRenderedElement, requireRenderedElement } from '../test-utils/componentHarness'

const hooks = vi.hoisted(() => ({ current: null as ReturnType<typeof createHookHarness> | null }))
const service = vi.hoisted(() => ({ fetchRequestSnapshot: vi.fn(), fetchPsfRequest: vi.fn() }))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return { ...actual, api: { ...actual.api, fetchRequestSnapshot: service.fetchRequestSnapshot, fetchPsfRequest: service.fetchPsfRequest } }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (value: unknown) => (hooks.current ? hooks.current.useState(value) : actual.useState(value)),
    useEffect: (effect: () => void, deps: unknown[]) =>
      hooks.current ? hooks.current.useEffect(effect, deps) : actual.useEffect(effect, deps),
  }
})

const requesterSchema: FormSchema = {
  formKey: 'psf-request',
  version: 1,
  title: 'PSF Request Form',
  sections: [{
    sectionKey: 'request',
    title: 'Request',
    fields: [
      { fieldKey: 'title', canonicalKey: 'title', label: 'Title', type: 'text', required: true },
      { fieldKey: 'requester_name', canonicalKey: 'requester_name', label: 'Requester', type: 'text', required: false },
      { fieldKey: 'modified_by', canonicalKey: 'modified_by', label: 'Modified By', type: 'text', required: false },
      { fieldKey: 'note', canonicalKey: 'note', label: 'Note', type: 'textarea', required: false },
    ],
  }, {
    sectionKey: 'schedule',
    title: 'Schedule',
    fields: [{ fieldKey: 'due_date', canonicalKey: 'due_date', label: 'Due Date', type: 'date', required: false }],
  }],
}

const psfSchema: FormSchema = {
  formKey: 'psf-created-information',
  version: 3,
  title: 'PSF Created Information',
  sections: [{
    sectionKey: 'psf',
    title: 'Setup',
    fields: [{ fieldKey: 'note', canonicalKey: 'psf_setup_file_name', label: 'Setup File Name', type: 'text', required: false }],
  }],
}

function requestSnapshot(overrides: Partial<RequestSnapshotResponse> = {}, entry: Partial<RequestSnapshotResponse['entry']> = {}): RequestSnapshotResponse {
  return {
    entry: {
      id: 'entry-1',
      hasRequestSnapshot: true,
      actionType: 'REQUESTER_INFORMATION_UPDATED',
      actorDisplayName: 'Editor',
      actorRole: 'requester',
      createdAt: '2026-10-04T23:30:00Z',
      metadata: { fieldChanges: [{ fieldKey: 'title', fieldLabel: 'Title', before: 'Original', after: 'Renamed' }] },
      ...entry,
    },
    requestNo: 'PSF-0042',
    currentStatus: 'Work',
    status: 'Work',
    formVersion: 1,
    requesterData: { title: 'Renamed', requester_name: 'Ada Requester', modified_by: 'Ben Editor', note: 'Line one\nLine two', due_date: '' },
    psfCreatedData: { note: 'setup.psf' },
    psfCreatedDataVisible: true,
    schemaSnapshot: requesterSchema,
    psfCreatedInformationSchema: psfSchema,
    ...overrides,
  }
}

const render = (snapshot: RequestSnapshotResponse) => renderToStaticMarkup(<RequestSnapshotView requestSnapshot={snapshot} />)
/** What a reader sees in a piece of markup, as one line of text. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
/** The markup of one form panel, up to the next panel. */
function panel(html: string, form: 'requester' | 'psf'): string {
  const start = html.indexOf(`id="request-snapshot-${form}"`)
  if (start < 0) return ''
  const next = html.indexOf('class="request-snapshot__panel', start)
  return html.slice(start, next < 0 ? undefined : next)
}
const labels = (html: string, form: 'requester' | 'psf') => [...panel(html, form).matchAll(/<dt[^>]*>(.*?)<\/dt>/g)].map((match) => text(match[1]).replace(' Changed in this update', ''))
/** One field row: its opening tag and the text a reader sees in it. */
function row(html: string, form: 'requester' | 'psf', fieldKey: string): { tag: string; text: string } {
  const at = html.indexOf(`id="request-snapshot-${form}-field-${fieldKey}"`)
  if (at < 0) throw new Error(`No ${form} row for ${fieldKey}`)
  const start = html.lastIndexOf('<div', at)
  return { tag: html.slice(start, html.indexOf('>', at) + 1), text: text(html.slice(start, html.indexOf('</dd>', at))) }
}

describe('RequestSnapshotView', () => {
  it('shows both forms of that time in Form Schema order, identity fields and blank values included', () => {
    const html = render(requestSnapshot({}, { actionType: 'REQUEST_STATUS_CHANGED', metadata: {} }))

    expect(labels(html, 'requester')).toEqual(['Title', 'Requester', 'Modified By', 'Note', 'Due Date'])
    expect(labels(html, 'psf')).toEqual(['Setup File Name'])
    expect(row(html, 'requester', 'requester_name').text).toBe('Requester Ada Requester')
    expect(row(html, 'requester', 'modified_by').text).toBe('Modified By Ben Editor')
    expect(row(html, 'requester', 'due_date').text).toBe('Due Date Not provided')
    expect(row(html, 'requester', 'note').text).toBe('Note Line one Line two')
    expect(html).toContain('>Line one\nLine two<')
    expect(row(html, 'psf', 'note').text).toBe('Setup File Name setup.psf')
  })
  it('marks only the fields the update changed, with the value before it underneath', () => {
    const html = render(requestSnapshot())

    const title = row(html, 'requester', 'title')
    expect(title.tag).toContain('request-snapshot__row--changed')
    expect(title.text).toBe('Title Changed in this update After this update: Renamed Before this update Original')
    for (const [form, key] of [['requester', 'note'], ['requester', 'due_date'], ['psf', 'note']] as const) {
      expect(row(html, form, key).tag).not.toContain('--changed')
      expect(row(html, form, key).text).not.toContain('this update')
    }
  })

  it('counts the edited fields and links to each of them', () => {
    const html = render(requestSnapshot({}, {
      metadata: { fieldChanges: [
        { fieldKey: 'title', fieldLabel: 'Title', before: 'Original', after: 'Renamed' },
        { fieldKey: 'note', fieldLabel: 'Note', before: null, after: 'Line one\nLine two' },
      ] },
    }))

    const summary = html.slice(html.indexOf('<nav aria-label="Changes in this update"'), html.indexOf('</nav>'))
    expect(text(summary)).toContain('2 fields edited')
    expect([...summary.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((link) => [link[1], text(link[2])])).toEqual([
      ['#request-snapshot-requester-field-title', 'Title'],
      ['#request-snapshot-requester-field-note', 'Note'],
    ])
    expect(row(html, 'requester', 'note').text).toBe('Note Changed in this update After this update: Line one Line two Before this update Not provided')
  })

  it('marks a PSF Created Information edit on the PSF form, not on a requester field with the same key', () => {
    const html = render(requestSnapshot({}, {
      actionType: 'PSF_CREATED_INFORMATION_UPDATED',
      metadata: { fieldChanges: [{ fieldKey: 'note', fieldLabel: 'Setup File Name', before: 'old.psf', after: 'setup.psf' }] },
    }))

    expect(row(html, 'psf', 'note').text).toBe('Setup File Name Changed in this update After this update: setup.psf Before this update old.psf')
    expect(row(html, 'requester', 'note').tag).not.toContain('--changed')
    expect(row(html, 'requester', 'note').text).toBe('Note Line one Line two')
    expect(html).toContain('href="#request-snapshot-psf-field-note"')
    expect(html).not.toContain('href="#request-snapshot-requester-field-note"')
  })

  /** The Work Status block: its opening tag and the text a reader sees in it. */
  function statusBlock(html: string): { tag: string; text: string } {
    const at = html.indexOf('id="request-snapshot-status"')
    const start = html.lastIndexOf('<section', at)
    return { tag: html.slice(start, html.indexOf('>', at) + 1), text: text(html.slice(start, html.indexOf('</section>', at))) }
  }

  it('shows a Status change as the complete stored names before and after the update, with an otherwise unmarked form', () => {
    const html = render(requestSnapshot({ status: '20% -- PSF File Creating' }, {
      actionType: 'REQUEST_STATUS_CHANGED',
      metadata: { fromStatus: '10% -- Test Engineer Data Entry', toStatus: '20% -- PSF File Creating' },
    }))

    const status = statusBlock(html)
    expect(status.tag).toContain('request-snapshot__status--changed')
    expect(status.text).toBe('Work Status Changed in this update Before this update 10% -- Test Engineer Data Entry After this update 20% -- PSF File Creating')
    const summary = text(html.slice(html.indexOf('<nav aria-label="Changes in this update"'), html.indexOf('</nav>')))
    expect(summary).toBe('Work Status changed Work Status No form-field edits were recorded for this update. The full form is shown below.')
    expect(html).toContain('href="#request-snapshot-status"')
    expect(html).not.toContain('request-snapshot__row--changed')
    expect(labels(html, 'requester')).toEqual(['Title', 'Requester', 'Modified By', 'Note', 'Due Date'])
  })

  it('shows the Work Status of that time alone when the update recorded no earlier Status', () => {
    const status = statusBlock(render(requestSnapshot({ status: '10% -- Test Engineer Data Entry' })))

    expect(status.tag).not.toContain('--changed')
    expect(status.text).toBe('Work Status 10% -- Test Engineer Data Entry')
  })

  it('lists the fields a Form Version upgrade removed apart from the form, with their earlier values', () => {
    const html = render(requestSnapshot({ formVersion: 2, schemaSnapshot: { ...requesterSchema, version: 2 } }, {
      actionType: 'DRAFT_REQUESTER_DATA_UPDATED',
      metadata: { fromFormVersion: 1, toFormVersion: 2, fieldChanges: [{ fieldKey: 'legacy', fieldLabel: 'Legacy Field', before: 'dropped value', after: null }] },
    }))

    expect(panel(html, 'requester')).not.toContain('Legacy Field')
    expect(html).not.toContain('request-snapshot__row--changed')
    const removed = html.slice(html.lastIndexOf('<section', html.indexOf('id="request-snapshot-removed"')))
    expect(text(removed.slice(0, removed.indexOf('</section>')))).toBe(
      'Fields removed in this update Form Version 2 no longer has these fields, so their values were dropped. Legacy Field Before this update dropped value',
    )
    expect(html).toMatch(/href="#request-snapshot-removed-field-legacy"[^>]*>.*?Legacy Field \(removed\)<\/a>/)
    expect(render(requestSnapshot())).not.toContain('request-snapshot-removed')
  })

  it('withholds PSF Created Information, its Form Version and its edits from a reader who may not see it', () => {
    const restricted = { psfCreatedDataVisible: false, psfCreatedData: {} }
    const html = render(requestSnapshot(restricted))

    expect(text(html)).toContain('PSF Created Information is not visible for this request.')
    expect(html).not.toContain('Setup File Name')
    expect(text(html)).not.toContain('PSF Created Information 3')
    expect(row(html, 'requester', 'title').text).toContain('Renamed')

    const psfEdit = render(requestSnapshot(restricted, {
      actionType: 'PSF_CREATED_INFORMATION_UPDATED',
      metadata: { fieldChanges: [{ fieldKey: 'note', fieldLabel: 'Setup File Name', before: 'old.psf', after: 'setup.psf' }] },
    }))
    expect(psfEdit).not.toContain('Setup File Name')
    expect(psfEdit).not.toContain('old.psf')
    expect(psfEdit).not.toContain('request-snapshot__row--changed')
  })

  it('names the update: when it was recorded in ICT, by whom, what it did and the Form Versions of that time', () => {
    const html = render(requestSnapshot())

    expect(text(html.slice(0, html.indexOf('<nav')))).toBe(
      'Recorded on 05 Oct 2026, 06:30:00 ICT (UTC+7) Requester information updated · By Editor (requester) Form Versions: Requester Information 1 · PSF Created Information 3 Read only',
    )
    expect(html).toContain('<time dateTime="2026-10-04T23:30:00Z">')
  })
})

describe('RequestSnapshotPage', () => {
  const identity = vi.fn()
  const render = () => { hooks.current!.beginRender(); return RequestSnapshotPage({ requestId: 'request-1', entryId: 'entry-1', onIdentityResolved: identity }) }
  const settle = async () => { hooks.current!.runEffects(); await new Promise((resolve) => setTimeout(resolve, 0)); return render() }

  beforeEach(() => {
    hooks.current = createHookHarness()
    service.fetchRequestSnapshot.mockReset()
    service.fetchPsfRequest.mockReset()
    identity.mockReset()
  })
  afterEach(() => { hooks.current = null })

  it('is the page of the request history entry route', () => {
    expect((Reflect.get(SnapshotRoute, 'options') as { component?: unknown }).component).toBeTypeOf('function')
  })

  it('loads the Request Snapshot named by the route and names its request for the breadcrumb', async () => {
    const data = requestSnapshot({ currentStatus: 'Draft' })
    service.fetchRequestSnapshot.mockResolvedValue(data)

    expect(requireRenderedElement(render(), (element) => element.type === AsyncNotice).props.kind).toBe('loading')
    const page = await settle()

    expect(service.fetchRequestSnapshot).toHaveBeenCalledWith('request-1', 'entry-1')
    expect(requireRenderedElement(page, (element) => element.type === RequestSnapshotView).props.requestSnapshot).toBe(data)
    hooks.current!.runEffects()
    expect(identity).toHaveBeenLastCalledWith({ requestId: 'request-1', requestNo: 'PSF-0042', isDraft: true })
  })

  it('names its request and links back to Request History, reading only the Request Snapshot', async () => {
    service.fetchRequestSnapshot.mockResolvedValue(requestSnapshot())
    const backLink = (page: unknown) => requireRenderedElement(page, (element) => element.type === Link).props

    expect(backLink(render())).toMatchObject({ to: '/requests/$requestId/history', params: { requestId: 'request-1' } })
    const page = await settle()

    expect(requireRenderedElement(page, (element) => element.type === PageHeader).props.description).toBe('PSF-0042 · The full request after this update. Read only.')
    expect(backLink(page)).toMatchObject({ to: '/requests/$requestId/history', params: { requestId: 'request-1' } })
    expect(renderToStaticMarkup(<>{backLink(page).children as ReactNode}</>)).toContain('Request History')
    expect(service.fetchPsfRequest).not.toHaveBeenCalled()
  })

  it('says why a Request Snapshot cannot be opened and loads it again on Retry', async () => {
    service.fetchRequestSnapshot.mockRejectedValueOnce(new Error('Request Snapshot was not found.'))
    render()
    const failed = await settle()

    const notice = requireRenderedElement(failed, (element) => element.type === AsyncNotice)
    expect(notice.props.title).toBe('Unable to load Request Snapshot: Request Snapshot was not found.')
    expect(findRenderedElement(failed, (element) => element.type === RequestSnapshotView)).toBeNull()

    const retry = requireRenderedElement(notice.props.action, (element) => element.type === 'button').props.onClick as () => void
    service.fetchRequestSnapshot.mockResolvedValue(requestSnapshot())
    retry()
    render()
    expect(findRenderedElement(await settle(), (element) => element.type === RequestSnapshotView)).not.toBeNull()
    expect(service.fetchRequestSnapshot).toHaveBeenCalledTimes(2)
  })
})
