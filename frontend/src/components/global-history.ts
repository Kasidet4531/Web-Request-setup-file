import type {
  GlobalAuditLogQuery,
  PsfRequestHistoryAction,
} from '../services/api'

export interface GlobalAuditLogFilterValues {
  requestId: string
  user: string
  actionType: '' | PsfRequestHistoryAction
  from: string
  to: string
}

export const EMPTY_GLOBAL_AUDIT_LOG_FILTERS: GlobalAuditLogFilterValues = {
  requestId: '',
  user: '',
  actionType: '',
  from: '',
  to: '',
}

export function buildGlobalAuditLogQuery(
  filters: GlobalAuditLogFilterValues,
): GlobalAuditLogQuery {
  const query: GlobalAuditLogQuery = {}
  const requestId = filters.requestId.trim()
  const user = filters.user.trim()

  if (requestId) {
    query.requestId = requestId
  }

  if (user) {
    query.user = user
  }

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
