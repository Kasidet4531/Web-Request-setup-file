import { createFileRoute } from '@tanstack/react-router'
import { PagePlaceholder } from '../../components/PagePlaceholder'

export const Route = createFileRoute('/requests/')({
  component: () => (
    <PagePlaceholder
      description="PSF Request listing, filters, and request creation entry points will live on this route."
      eyebrow="Route placeholder"
      title="PSF Requests"
    />
  ),
})
