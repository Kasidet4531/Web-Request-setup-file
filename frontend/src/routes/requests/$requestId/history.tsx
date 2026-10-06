import { createFileRoute } from '@tanstack/react-router'
import { RequestHistoryRoutePage } from '../../../components/RequestsWorkspace'

export const Route = createFileRoute('/requests/$requestId/history')({ component: RequestHistoryRoutePage })
