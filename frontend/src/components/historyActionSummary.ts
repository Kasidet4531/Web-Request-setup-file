import type { PsfRequestHistoryEntry } from '../services/api'

export function historyActionSummary(entry: PsfRequestHistoryEntry): string {
  switch (entry.actionType) {
    case 'DRAFT_CREATED':
      return 'Draft created'
    case 'DRAFT_REQUESTER_DATA_UPDATED':
      return 'Draft requester information updated'
    case 'REQUEST_SUBMITTED':
      return 'Request submitted'
    case 'REQUEST_STATUS_CHANGED': {
      const fromStatus = entry.metadata.fromStatus
      const toStatus = entry.metadata.toStatus

      if (typeof fromStatus === 'string' && typeof toStatus === 'string') {
        return `${fromStatus} → ${toStatus}`
      }

      return 'Request status changed'
    }
    case 'REQUESTER_INFORMATION_UPDATED': return 'Requester information updated'
    case 'PSF_CREATED_INFORMATION_UPDATED': return 'PSF Created Information updated'
    case 'WORKFLOW_CATALOG_UPDATED': return 'Workflow catalog updated'
  }
}
