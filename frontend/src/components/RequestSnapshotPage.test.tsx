import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestSnapshotPage, RequestSnapshotView } from './RequestSnapshotPage'
import { Route as SnapshotRoute } from '../routes/requests/$requestId/history_.$entryId'
import { AsyncNotice } from './ui/AsyncNotice'
import type { RequestSnapshotResponse } from '../services/api'
import type { FormSchema } from '../types/forms'
import { createHookHarness, findRenderedElement, requireRenderedElement } from '../test-utils/componentHarness'

const hooks = vi.hoisted(() => ({ current: null as ReturnType<typeof createHookHarness> | null }))
const service = vi.hoisted(() => ({ fetchRequestSnapshot: vi.fn() }))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return { ...actual, api: { ...actual.api, fetchRequestSnapshot: service.fetchRequestSnapshot } }
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
      { fieldKey: 'note', canonicalKey: 'note', label: 'Note', type: 'textarea', required: false },
    ],
  }],
}

const psfSchema: FormSchema = {
  formKey: 'psf-created-information',
  version: 1,
  title: 'PSF Created Information',
  sections: [{
    sectionKey: 'psf',
    title: 'Setup',
    fields: [{ fieldKey: 'note', canonicalKey: 'psf_setup_file_name', label: 'Setup File Name', type: 'text', required: false }],
  }],
}

function snapshot(overrides: Partial<RequestSnapshotResponse> = {}, entry: Partial<RequestSnapshotResponse['entry']> = {}): RequestSnapshotResponse {
  return {
    entry: {
      id: 'entry-1',
      hasSnapshot: true,
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
    requesterData: { title: 'Renamed', note: 'Kept' },
    psfCreatedData: { note: 'setup.psf' },
    psfCreatedDataVisible: true,
    schemaSnapshot: requesterSchema,
    psfCreatedInformationSchema: psfSchema,
    ...overrides,
  }
}

describe('RequestSnapshotView', () => {
  it('shows the whole request of that time and what the entry changed', () => {
    const html = renderToStaticMarkup(<RequestSnapshotView snapshot={snapshot()} />)

    expect(html).toContain('Requester information updated')
    expect(html).toContain('Editor')
    expect(html).toContain('05 Oct 2026, 06:30:00')
    expect(html).toContain('Work')
    for (const value of ['Renamed', 'Kept', 'setup.psf']) expect(html).toContain(`>${value}</output>`)
    expect(html).toContain('Previous: Original')
    expect(html.match(/Previous: /g)).toHaveLength(1)
    expect(html).toMatch(/Changed fields<\/dt><dd>Title<\/dd>/)
  })

  it('withholds PSF Created Information that is not visible to the reader', () => {
    const html = renderToStaticMarkup(<RequestSnapshotView snapshot={snapshot({ psfCreatedDataVisible: false, psfCreatedData: {} })} />)

    expect(html).toContain('PSF Created Information is not visible for this request.')
    expect(html).not.toContain('Setup File Name')
    expect(html).toContain('>Renamed</output>')
  })

  it('shows a PSF Created Information change on the PSF form, not on a requester field', () => {
    const html = renderToStaticMarkup(<RequestSnapshotView snapshot={snapshot({}, {
      actionType: 'PSF_CREATED_INFORMATION_UPDATED',
      metadata: { fieldChanges: [{ fieldKey: 'note', fieldLabel: 'Setup File Name', before: 'old.psf', after: 'setup.psf' }] },
    })} />)

    expect(html.match(/Previous: /g)).toHaveLength(1)
    expect(html.indexOf('Previous: old.psf')).toBeGreaterThan(html.indexOf('>setup.psf</output>'))
  })

  it('shows the Work Status of that time next to the one it replaced', () => {
    const html = renderToStaticMarkup(<RequestSnapshotView snapshot={snapshot({ status: 'Work' }, {
      actionType: 'REQUEST_STATUS_CHANGED',
      metadata: { fromStatus: 'Submitted', toStatus: 'Work' },
    })} />)

    expect(html).toMatch(/Work Status<\/dt><dd>Work<span[^>]*> Previous: Submitted<\/span><\/dd>/)
    expect(html).toMatch(/Changed fields<\/dt><dd>None<\/dd>/)
  })

  it('shows every field a new request was created with as new', () => {
    const html = renderToStaticMarkup(<RequestSnapshotView snapshot={snapshot({ status: 'Draft' }, {
      actionType: 'DRAFT_CREATED',
      metadata: { fieldChanges: [
        { fieldKey: 'title', fieldLabel: 'Title', before: null, after: 'Renamed' },
        { fieldKey: 'note', fieldLabel: 'Note', before: null, after: 'Kept' },
      ] },
    })} />)

    expect(html.match(/Previous: Empty/g)).toHaveLength(2)
  })

  it('lists apart the fields a Form Version upgrade removed', () => {
    const html = renderToStaticMarkup(<RequestSnapshotView snapshot={snapshot({ formVersion: 2 }, {
      actionType: 'DRAFT_REQUESTER_DATA_UPDATED',
      metadata: { fromFormVersion: 1, toFormVersion: 2, fieldChanges: [{ fieldKey: 'legacy', fieldLabel: 'Legacy Field', before: 'dropped value', after: null }] },
    })} />)

    const removed = html.slice(html.indexOf('Removed fields'))
    expect(removed).toContain('Form Version 2')
    expect(removed).toContain('Legacy Field')
    expect(removed).toContain('dropped value')
    expect(html).not.toContain('Previous: ')
    expect(renderToStaticMarkup(<RequestSnapshotView snapshot={snapshot()} />)).not.toContain('Removed fields')
  })
})

describe('RequestSnapshotPage', () => {
  const identity = vi.fn()
  const render = () => { hooks.current!.beginRender(); return RequestSnapshotPage({ requestId: 'request-1', entryId: 'entry-1', onIdentityResolved: identity }) }
  const settle = async () => { hooks.current!.runEffects(); await new Promise((resolve) => setTimeout(resolve, 0)); return render() }

  beforeEach(() => {
    hooks.current = createHookHarness()
    service.fetchRequestSnapshot.mockReset()
    identity.mockReset()
  })
  afterEach(() => { hooks.current = null })

  it('is the page of the request history entry route', () => {
    expect((Reflect.get(SnapshotRoute, 'options') as { component?: unknown }).component).toBeTypeOf('function')
  })

  it('loads the Request Snapshot named by the route and names its request for the breadcrumb', async () => {
    const data = snapshot({ currentStatus: 'Draft' })
    service.fetchRequestSnapshot.mockResolvedValue(data)

    expect(requireRenderedElement(render(), (element) => element.type === AsyncNotice).props.kind).toBe('loading')
    const page = await settle()

    expect(service.fetchRequestSnapshot).toHaveBeenCalledWith('request-1', 'entry-1')
    expect(requireRenderedElement(page, (element) => element.type === RequestSnapshotView).props.snapshot).toBe(data)
    hooks.current!.runEffects()
    expect(identity).toHaveBeenLastCalledWith({ requestId: 'request-1', requestNo: 'PSF-0042', isDraft: true })
  })

  it('says why a Request Snapshot cannot be opened and loads it again on Retry', async () => {
    service.fetchRequestSnapshot.mockRejectedValueOnce(new Error('Request Snapshot was not found.'))
    render()
    const failed = await settle()

    const notice = requireRenderedElement(failed, (element) => element.type === AsyncNotice)
    expect(notice.props.title).toBe('Unable to load Request Snapshot: Request Snapshot was not found.')
    expect(findRenderedElement(failed, (element) => element.type === RequestSnapshotView)).toBeNull()

    const retry = requireRenderedElement(notice.props.action, (element) => element.type === 'button').props.onClick as () => void
    service.fetchRequestSnapshot.mockResolvedValue(snapshot())
    retry()
    render()
    expect(findRenderedElement(await settle(), (element) => element.type === RequestSnapshotView)).not.toBeNull()
    expect(service.fetchRequestSnapshot).toHaveBeenCalledTimes(2)
  })
})
