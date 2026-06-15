import { createFileRoute } from '@tanstack/react-router'
import { PagePlaceholder } from '../../components/PagePlaceholder'

export const Route = createFileRoute('/dashboard/')({
  component: () => (
    <PagePlaceholder
      description="Dashboard widgets, request summaries, and role-based insights will be added here next."
      eyebrow="Route placeholder"
      title="Dashboard"
    />
  ),
})
