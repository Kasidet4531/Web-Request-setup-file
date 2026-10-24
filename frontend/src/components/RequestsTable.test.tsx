import { describe, expect, it } from 'vitest'
import { RequestsTable } from './RequestsWorkspace'
import type { PsfRequestListItem } from '../services/api'

interface TreeElement { type: unknown; props: Record<string, unknown> }

function elementsOfType(node: unknown, type: string): TreeElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => elementsOfType(child, type))
  if (!node || typeof node !== 'object' || !('props' in node) || !('type' in node)) return []
  const element = node as TreeElement
  return [...(element.type === type ? [element] : []), ...elementsOfType(element.props.children, type)]
}

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!node || typeof node !== 'object' || !('props' in node)) return ''
  return textOf((node as TreeElement).props.children)
}

const headers = (table: unknown) => elementsOfType(table, 'th').map((th) => textOf(th.props.children))
const cell = (table: unknown, label: string) => {
  const match = elementsOfType(table, 'td').find((td) => td.props['data-label'] === label)
  if (!match) throw new Error(`No ${label} cell`)
  return textOf(match.props.children)
}

const request: PsfRequestListItem = {
  requestId: 'request-42',
  requestNo: 'PSF-000042',
  title: 'Probe card update',
  referencePsfName: null,
  psfSetupFileName: 'SETUP_A.psf',
  jobFileName: 'JOB_A.job',
  probecardName: 'PC-7',
  status: '10% -- Test Engineer Data Entry',
  priority: null,
  requester: 'Somchai',
  productType: 'Create new PSF (Require PCSF , E142 or .DPL)',
  requestFor: 'Production',
  requestDate: '2026-10-01',
  dueDate: '2026-10-30',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

describe('Request list columns', () => {
  it('starts with Target 12NC Desc and puts Request For right after Request To', () => {
    const table = RequestsTable({ items: [request], onOpenItem: () => {} })

    expect(headers(table)).toEqual([
      'Target 12NC Desc',
      'Request No.',
      'Request To',
      'Request For',
      'Status',
      'PSF Setup File Name',
      'Job File Name',
      'Due Date',
      'Requester',
    ])
    expect(cell(table, 'PSF Setup File Name')).toBe('SETUP_A.psf')
    expect(cell(table, 'Job File Name')).toBe('JOB_A.job')
  })

  it('holds one value in each cell', () => {
    const table = RequestsTable({ items: [request], onOpenItem: () => {} })

    expect(cell(table, 'Target 12NC Desc')).toBe('Probe card update')
    expect(cell(table, 'Request No.')).toBe('PSF-000042')
    expect(cell(table, 'Request To')).toBe('Create new PSF')
    expect(cell(table, 'Request For')).toBe('Production')
    expect(cell(table, 'Requester')).toBe('Somchai')
  })

  it('shows a dash for a missing value instead of filling it from another column', () => {
    const table = RequestsTable({
      items: [{ ...request, title: null, requestFor: null, psfSetupFileName: null, jobFileName: null }],
      onOpenItem: () => {},
    })

    expect(cell(table, 'Target 12NC Desc')).toBe('—')
    expect(cell(table, 'Request For')).toBe('—')
    expect(cell(table, 'PSF Setup File Name')).toBe('—')
    expect(cell(table, 'Job File Name')).toBe('—')
  })

  it('lists My Drafts by Target 12NC Desc, Request No. and Request To in separate columns', () => {
    const table = RequestsTable({ items: [{ ...request, status: 'Draft', requestNo: 'DRAFT-20261021-0001' }], drafts: true, onDeleteItem: () => {} })

    expect(headers(table)).toEqual(['Target 12NC Desc', 'Request No.', 'Request To', 'Updated', 'Actions'])
    expect(cell(table, 'Target 12NC Desc')).toBe('Probe card update')
    expect(cell(table, 'Request No.')).toBe('DRAFT-20261021-0001')
  })
})
