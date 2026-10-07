// Measured sizes (px) of the shared table styles; keep in sync with ux-polish.css / index.css.
export const TABLE_HEADER_PX = 43
export const ROW_PX = { audit: 52, requests: 89, dashboard: 71 } as const

/** Reserve the height of a full page so the pagination footer stays put on the last, shorter page. */
export function pagedMinHeight(total: number, limit: number, rowPx: number) {
  return total > limit ? { minHeight: TABLE_HEADER_PX + limit * rowPx } : undefined
}

export const DANGER_BUTTON_CLASS = 'btn-secondary ui-button--danger'
