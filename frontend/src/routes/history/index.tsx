import { createFileRoute } from '@tanstack/react-router'
import { GlobalHistoryPage } from '../../components/GlobalHistoryPage'

export const Route = createFileRoute('/history/')({
  component: GlobalHistoryPage,
})
