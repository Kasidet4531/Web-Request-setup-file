import { createFileRoute } from '@tanstack/react-router'
import { RequestDetailRoutePage } from '../../../components/RequestsWorkspace'

export const Route = createFileRoute('/requests/$requestId/')({
  component: RequestDetailRoutePage,
})
