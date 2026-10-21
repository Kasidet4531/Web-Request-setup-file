import { createFileRoute } from '@tanstack/react-router'
import { RequestSnapshotRoutePage } from '../../../components/RequestSnapshotPage'

export const Route = createFileRoute('/requests/$requestId/history_/$entryId')({
  component: RequestSnapshotRoutePage,
  validateSearch: (search: Record<string, unknown>): { variant?: 'A' } => ({
    variant: search.variant === 'A' || search.variant === 'B' ? 'A' : undefined,
  }),
})
