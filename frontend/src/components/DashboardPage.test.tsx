import { describe, expect, it, vi } from 'vitest'
import { RequestsTable } from './RequestsWorkspace'
import type { PsfRequestListItem } from '../services/api'

function findRequestLink(node: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) return node.map(findRequestLink).find(Boolean) ?? null
  if (!node || typeof node !== 'object' || !('props' in node)) return null
  const element = node as { props: Record<string, unknown> }
  if (element.props.to === '/requests/$requestId') return element
  return findRequestLink(element.props.children)
}

function findRow(node: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findRow(child)
      if (match) return match
    }
    return null
  }

  if (!node || typeof node !== 'object' || !('props' in node) || !('type' in node)) {
    return null
  }

  const element = node as { type: unknown; props: Record<string, unknown> }
  if (element.type === 'tr' && element.props.tabIndex === 0) return element
  return findRow(element.props.children)
}

describe('Request list rows', () => {
  it('uses the existing request id for click and keyboard detail navigation without an action column', () => {
    const onOpenItem = vi.fn()
    const request: PsfRequestListItem = {
      requestId: 'request-42',
      requestNo: 'PSF-0042',
      title: 'Probe card update',
      referencePsfName: null,
      psfSetupFileName: null,
      probecardName: null,
      status: 'Submitted',
      priority: 'High',
      requester: 'Requester',



      productType: 'Existing Product',
      dueDate: null,
      requestDate: '2026-01-01',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const table = RequestsTable({ items: [request], onOpenItem })
    const row = findRow(table)
    if (!row) throw new Error('Expected an interactive dashboard row')

    expect(row.props['aria-label']).toBe('Open PSF-0042 details')
    expect(row.props.className).toContain('data-table__row--interactive')
    expect(JSON.stringify(table)).not.toContain('Open detail')
    expect(JSON.stringify(table)).not.toContain('Action')

    const identityLink = findRequestLink(table)
    expect(identityLink?.props.params).toEqual({ requestId: 'request-42' })
    expect(JSON.stringify(identityLink)).toContain('PSF-0042')

    ;(row.props.onClick as () => void)()
    ;(row.props.onKeyDown as (event: { key: string; preventDefault: () => void }) => void)({
      key: 'Enter',
      preventDefault: vi.fn(),
    })
    ;(row.props.onKeyDown as (event: { key: string; preventDefault: () => void }) => void)({
      key: ' ',
      preventDefault: vi.fn(),
    })

    expect(onOpenItem).toHaveBeenCalledTimes(3)
    expect(onOpenItem).toHaveBeenNthCalledWith(1, 'request-42')
  })
})

 it('removes assignment metadata and offers permanent deletion for own drafts', () => {
  const item = { requestId: 'draft-1', requestNo: 'PSF-1', title: 'Draft title', productType: null, updatedAt: '2026-10-07T00:00:00Z', requester: 'Creator' } as PsfRequestListItem
  const table = RequestsTable({ items: [item], drafts: true, onDeleteItem: () => {} })
  expect(JSON.stringify(table)).toContain('Delete')
  expect(JSON.stringify(RequestsTable({ items: [item] }))).not.toContain('Owner / Dept')
  expect(JSON.stringify(table)).toContain('รอระบุ Product Type')
 })
