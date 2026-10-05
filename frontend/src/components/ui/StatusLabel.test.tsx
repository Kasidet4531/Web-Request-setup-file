import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatusLabel } from './StatusLabel'

const fullStatus = '93% -- Provide test template map to EWFM\\Update auto FI script (ST Fab)'

describe('Status full-value disclosure', () => {
  it('provides an accessible disclosure control and the complete exact stored value', () => {
    const html = renderToStaticMarkup(<StatusLabel status={fullStatus} kind="open" />)
    expect(html).toContain('<button')
    expect(html).toContain(`aria-label="${fullStatus}"`)
    expect(html).toContain('popover="auto"')
    expect(html).toContain('role="tooltip"')
    expect(html).toContain(fullStatus)
  })

  it('uses catalog kind without interpreting a percent prefix as completion', () => {
    const html = renderToStaticMarkup(<StatusLabel status="83% -- Complete Excel probe pattern" kind="open" />)
    expect(html).toContain('ui-status--open')
    expect(html).not.toContain('ui-status--completed')
  })
})
