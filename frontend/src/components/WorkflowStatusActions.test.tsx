import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkflowStatusActions, type WorkflowStatusActionsProps } from './RequestsWorkspace'

function renderActions(overrides: Partial<WorkflowStatusActionsProps> = {}) {
  return renderToStaticMarkup(<WorkflowStatusActions
    allowedNextStatuses={['Review', 'Complete']}
    currentStatus="Review"
    selectedStatus="Review"
    onApply={() => undefined}
    onStatusChange={() => undefined}
    saving={false}
    {...overrides}
  />)
}

describe('Workflow status guidance', () => {
  it('labels the explicit submitted-status commit separately from Draft submission', () => {
    expect(renderActions({ selectedStatus: 'Complete' })).toContain('Save Status')
    expect(renderActions({ selectedStatus: 'Complete' })).not.toContain('Apply status')
    expect(renderActions({ currentStatus: 'Draft', isDraft: true })).toContain('Submit request')
  })

  it('explains the unchanged selection without implying the request is blocked', () => {
    expect(renderActions()).toContain('Choose a different status, then Save Status.')
  })

  it('explains the next step for a draft while leaving submission explicit', () => {
    expect(renderActions({ currentStatus: 'Draft', selectedStatus: 'Draft', isDraft: true }))
      .toContain('Choose a status before submitting your draft.')
  })

  it('explains when no different status is available', () => {
    expect(renderActions({ allowedNextStatuses: ['Review'] }))
      .toContain('No status changes are available for this request.')
  })

  it('keeps an existing dirty or schema blocking reason as the only guidance', () => {
    const markup = renderActions({ disabledReason: 'Save requester information before changing status.' })
    expect(markup).toContain('Save requester information before changing status.')
    expect(markup).not.toContain('Choose a different status')
  })

  it('removes selection guidance when a valid change is ready or saving', () => {
    expect(renderActions({ selectedStatus: 'Complete' })).not.toContain('Choose a different status')
    expect(renderActions({ saving: true })).not.toContain('Choose a different status')
  })
})

describe('Status dropdown order', () => {
  const optionOrder = (markup: string) => [...markup.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1])

  it('lists the statuses in catalog order, with the current status in its own place', () => {
    const markup = renderActions({
      allowedNextStatuses: ['Third work', 'First work'],
      currentStatus: 'Second work',
      selectedStatus: 'Second work',
      catalogOrder: ['Draft', 'Third work', 'Second work', 'First work'],
    })
    expect(optionOrder(markup)).toEqual(['Third work', 'Second work', 'First work'])
  })

  it('keeps Draft first while a Draft is submitted', () => {
    const markup = renderActions({
      allowedNextStatuses: ['Second work', 'First work'],
      currentStatus: 'Draft',
      selectedStatus: 'Draft',
      isDraft: true,
      catalogOrder: ['Draft', 'Second work', 'First work'],
    })
    expect(optionOrder(markup)).toEqual(['Draft', 'Second work', 'First work'])
  })

  it('keeps a current status that is no longer in the catalog first', () => {
    const markup = renderActions({
      allowedNextStatuses: ['Second work', 'First work'],
      currentStatus: 'Imported status',
      selectedStatus: 'Imported status',
      catalogOrder: ['Draft', 'Second work', 'First work'],
    })
    expect(optionOrder(markup)).toEqual(['Imported status', 'Second work', 'First work'])
  })
})
