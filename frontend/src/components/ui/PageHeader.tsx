import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header">
    <div className="page-header__copy"><h1>{title}</h1>{description ? <div className="page-card__description">{description}</div> : null}</div>
    {actions ? <div className="page-card__actions">{actions}</div> : null}
  </header>
}
