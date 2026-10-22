import type {
  GlobalAuditLogQuery,
  PsfRequestHistoryAction,
} from '../services/api'

export interface GlobalAuditLogFilterValues {
  keyword: string
  actionType: '' | PsfRequestHistoryAction
  from: string
  to: string
}

export const EMPTY_GLOBAL_AUDIT_LOG_FILTERS: GlobalAuditLogFilterValues = {
  keyword: '',
  actionType: '',
  from: '',
  to: '',
}

export function buildGlobalAuditLogQuery(
  filters: GlobalAuditLogFilterValues,
): GlobalAuditLogQuery {
  const query: GlobalAuditLogQuery = {}
  const keyword = filters.keyword.trim()
  if (keyword) query.keyword = keyword

  if (filters.actionType) {
    query.actionType = filters.actionType
  }

  if (filters.from) {
    query.from = filters.from
  }

  if (filters.to) {
    query.to = filters.to
  }

  return query
}

export function historyDateRangeError(from: string, to: string): string | null {
  return from && to && from > to ? 'Choose an end date on or after the start date.' : null
}
