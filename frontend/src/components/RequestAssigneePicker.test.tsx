import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { requireRenderedElement, type RenderedElement } from '../test-utils/componentHarness'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestAssigneePicker } from './RequestAssigneePicker'
const requestApi = vi.hoisted(() => ({ fetchRequestAssignees: vi.fn() }))
const hookHarness = await vi.hoisted(async () => {
  const { createHookHarness } = await import('../test-utils/componentHarness')
  return createHookHarness()
})

vi.mock('../services/api', async load => ({ ...await load<typeof import('../services/api')>(), api: requestApi }))
vi.mock('react', async load => ({ ...await load<typeof import('react')>(), useEffect: hookHarness.useEffect, useMemo: hookHarness.useMemo, useRef: hookHarness.useRef, useState: hookHarness.useState, useId: () => 'test-id' }))
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
  it('distinguishes same-name same-Dept accounts by searchable stable labels, including colliding ID prefixes', async () => {
    const owners = [
      { id: '12345678-0000-4000-8000-000000000001', displayName: 'Same name with a very long display name', setupOwnerDepartment: 'GNTC' },
      { id: '12345678-1000-4000-8000-000000000002', displayName: 'Same name with a very long display name', setupOwnerDepartment: 'GNTC' },
      { id: '87654321-0000-4000-8000-000000000003', displayName: 'Different name', setupOwnerDepartment: 'MFG' },
    ]
    requestApi.fetchRequestAssignees.mockResolvedValue({ items: owners })
    const change = vi.fn()
    render(null, change); hookHarness.runEffects(); await flush()
    let page = render(null, change)
    const options = (tree: unknown) => (find(tree, 'Setup owner').props.children as RenderedElement[]).flat(Infinity).filter(e => e?.type === 'option')
    const label = (option: RenderedElement) => renderToStaticMarkup(<select>{option as unknown as ReactElement}</select>).replace(/<[^>]+>/g, '')
    const original = options(page).filter(option => option.props.value !== '')
    const labels = original.map(label)
    expect(new Set(labels).size).toBe(3)
    expect(labels[0]).toMatch(/^Account ID \S+ .*Same name with a very long display name.*GNTC$/)
    expect(labels[1]).toMatch(/^Account ID \S+ .*Same name with a very long display name.*GNTC$/)
    expect(labels[2]).toBe('Different name / MFG')
    const qualifier = labels[1].split(' ')[2]
    ;(find(page, 'Search setup owners').props.onChange as (e: { target: { value: string } }) => void)({ target: { value: qualifier } })
    page = render(null, change)
    const match = options(page).filter(option => option.props.value !== '')
    expect(match.map(label)).toEqual([labels[1]])
    ;(find(page, 'Setup owner').props.onChange as (e: { target: { value: string } }) => void)({ target: { value: String(match[0].props.value) } })
    expect(change).toHaveBeenLastCalledWith(owners[1].id)
    ;(find(page, 'Search setup owners').props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'No matching name' } })
    page = render(owners[1].id, change)
    expect(options(page).filter(option => option.props.value !== '').map(label)).toEqual([labels[1]])
    expect(find(page, 'Setup owner').props.value).toBe(owners[1].id)
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
