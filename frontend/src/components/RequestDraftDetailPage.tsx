import { useParams } from '@tanstack/react-router'
import { ActiveSchemaForm } from './ActiveSchemaForm'

export function RequestDraftDetailPage() {
  const { requestId } = useParams({ from: '/requests/$requestId/' })

  return (
    <article className="page-card">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Draft request</p>
          <h1>PSF Request Detail</h1>
          <p className="page-card__description">
            Reopen a saved Draft request and continue editing requester-owned fields until it leaves Draft status.
          </p>
        </div>
      </div>
      <div className="page-card__body">
        <ActiveSchemaForm mode="request" requestId={requestId} />
      </div>
    </article>
  )
}
