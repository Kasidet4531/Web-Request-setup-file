import { createFileRoute } from '@tanstack/react-router'
import { RequestDraftDetailPage } from '../../../components/RequestDraftDetailPage'

export const Route = createFileRoute('/requests/$requestId/')({
  component: RequestDraftDetailPage,
})
