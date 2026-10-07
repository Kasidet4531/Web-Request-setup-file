import { describe, expect, it } from 'vitest'
import { pagedMinHeight, ROW_PX, TABLE_HEADER_PX } from './tableLayout'

describe('pagedMinHeight', () => {
  it('does nothing when everything fits on one page', () => {
    expect(pagedMinHeight(25, 25, ROW_PX.audit)).toBeUndefined()
  })
  it('reserves header plus a full page of rows when there are several pages', () => {
    expect(pagedMinHeight(26, 25, ROW_PX.audit)).toEqual({ minHeight: TABLE_HEADER_PX + 25 * 52 })
  })
})
