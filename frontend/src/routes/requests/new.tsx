import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, FilePlus } from 'lucide-react'
import { ActiveSchemaForm } from '../../components/ActiveSchemaForm'

export const Route = createFileRoute('/requests/new')({
  component: () => (
    <article className="page-card workflow-page">
      <div className="page-header">
        <div className="page-header__title">
          <Link className="btn-ghost" to="/requests">
            <ArrowLeft size={15} /> Back to Requests
          </Link>
          <span className="page-header__icon">
            <FilePlus size={20} />
          </span>
          <div>
            <h1>Create PSF Request</h1>
            <p className="page-card__description">
              Save a Draft to continue later, then submit from the same server-backed request.
            </p>
          </div>
        </div>
      </div>
      <ActiveSchemaForm mode="request" />
    </article>
  ),
})
