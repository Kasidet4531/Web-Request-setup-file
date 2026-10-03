import { FileText, CircleDot, CircleCheck, CircleX, Circle } from 'lucide-react'
import type { WorkflowStatusKind } from '../../services/api'

const icons = { draft: FileText, open: CircleDot, completed: CircleCheck, cancelled: CircleX, neutral: Circle }

export function StatusLabel({ status, kind = 'neutral', compact = false }: { status: string; kind?: WorkflowStatusKind | 'neutral'; compact?: boolean }) {
  const Icon = icons[kind] ?? Circle
  return <span className={`ui-status ui-status--${kind}${compact ? ' ui-status--compact' : ''}`}>
    <Icon aria-hidden="true" size={16} strokeWidth={1.75} /><span>{status}</span>
  </span>
}
