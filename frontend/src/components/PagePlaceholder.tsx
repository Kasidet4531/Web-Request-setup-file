import type { ReactNode } from 'react'

interface PagePlaceholderProps {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}

export function PagePlaceholder({ eyebrow, title, description, actions }: PagePlaceholderProps) {
  return (
    <section className="page-card">
      <p className="page-card__eyebrow">{eyebrow}</p>
      <div className="page-card__header">
        <div>
          <h1>{title}</h1>
          <p className="page-card__description">{description}</p>
        </div>
        {actions ? <div className="page-card__actions">{actions}</div> : null}
      </div>
      <div className="page-card__body">
        <div className="page-card__section">
          <h2>Baseline ready</h2>
          <p>
            This route is intentionally lightweight for now. It confirms shared navigation,
            layout, and API wiring before feature-specific forms and tables land.
          </p>
        </div>
      </div>
    </section>
  )
}
