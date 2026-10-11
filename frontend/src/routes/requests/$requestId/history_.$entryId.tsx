import { createFileRoute } from '@tanstack/react-router'
import { RequestSnapshotRoutePage } from '../../../components/RequestSnapshotPage'

export const Route = createFileRoute('/requests/$requestId/history_/$entryId')({ component: RequestSnapshotRoutePage })
