import { createFileRoute } from '@tanstack/react-router'
import { ActiveSchemaForm } from '../../components/ActiveSchemaForm'

export const Route = createFileRoute('/requests/new')({
  component: () => (
    <article className="page-card">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Requester input</p>
          <h1>Create PSF Request</h1>
          <p className="page-card__description">
            This form is rendered from the active backend schema so request creation stays aligned with published form definitions.
          </p>
        </div>
      </div>
      <div className="page-card__body">
        <ActiveSchemaForm mode="request" />
      </div>
    </article>
  ),
})
