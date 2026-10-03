import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AsyncNotice } from './AsyncNotice'
import { StatusLabel } from './StatusLabel'
import { ConfirmDialog } from './ConfirmDialog'

describe('accessible presentation boundaries', () => {
  it('announces errors as alerts and completed saves as status', () => {
    expect(renderToStaticMarkup(<AsyncNotice kind="error" title="Save failed" />)).toContain('role="alert"')
    expect(renderToStaticMarkup(<AsyncNotice kind="success" title="Changes saved" />)).toContain('role="status"')
  })
  it('uses the supplied catalog kind even when a custom name suggests another state', () => {
    const markup = renderToStaticMarkup(<StatusLabel kind="open" status="Completed validation review" />)
    expect(markup).toContain('ui-status--open')
    expect(markup).not.toContain('ui-status--completed')
    expect(markup).toContain('Completed validation review')
    expect(renderToStaticMarkup(<StatusLabel status="100% Complete" />)).toContain('ui-status--neutral')
  })
  it('locks both confirm and cancel while a mutation is pending', () => {
    const markup = renderToStaticMarkup(<ConfirmDialog open title="Discard draft?" confirmLabel="Discard" pending onCancel={() => {}} onConfirm={() => {}} />)
    expect(markup.match(/disabled=""/g)).toHaveLength(2)
    expect(markup).toContain('aria-labelledby=')
    expect(markup).toContain('Discard draft?')
  })
})
