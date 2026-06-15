import { createFileRoute } from '@tanstack/react-router'
import { PagePlaceholder } from '../../components/PagePlaceholder'

export const Route = createFileRoute('/history/')({
  component: () => (
    <PagePlaceholder
      description="Request audit history and timeline views will be added here after the first request workflows land."
      eyebrow="Route placeholder"
      title="History"
    />
  ),
})
