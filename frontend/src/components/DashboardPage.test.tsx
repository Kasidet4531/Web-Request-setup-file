import { describe, expect, it, vi } from 'vitest'
import { RequestsTable } from './RequestsWorkspace'
import type { PsfRequestListItem } from '../services/api'

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
      setupOwner: 'Owner',
      setupOwnerRole: 'GNTC',
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
