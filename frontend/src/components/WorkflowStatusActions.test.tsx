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
  it('explains the unchanged selection without implying the request is blocked', () => {
    expect(renderActions()).toContain('Choose a different status to apply a change.')
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
