import { FileText, CircleDot, CircleCheck, CircleX, Circle } from 'lucide-react'
import { useId, useRef } from 'react'
import type { WorkflowStatusKind } from '../../services/api'

const icons = { draft: FileText, open: CircleDot, completed: CircleCheck, cancelled: CircleX, neutral: Circle }

export function StatusLabel({ status, kind = 'neutral', compact = false }: { status: string; kind?: WorkflowStatusKind | 'neutral'; compact?: boolean }) {
  const Icon = icons[kind] ?? Circle
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const disclosure = useRef<HTMLSpanElement>(null)
  const pinned = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelHide = () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  const show = () => {
    cancelHide()
    const button = trigger.current
    const panel = disclosure.current
    if (!button || !panel) return
    const rect = button.getBoundingClientRect()
    const width = Math.min(480, window.innerWidth - 32)
    panel.style.width = `${width}px`
    panel.style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`
    panel.style.top = `${rect.bottom + 8}px`
    panel.showPopover()
    const height = panel.getBoundingClientRect().height
    if (rect.bottom + 8 + height > window.innerHeight - 16) panel.style.top = `${Math.max(16, rect.top - height - 8)}px`
  }
  const scheduleHide = () => {
    cancelHide()
    hideTimer.current = setTimeout(() => { if (!pinned.current) disclosure.current?.hidePopover() }, 150)
  }
  return <span className={`ui-status ui-status--${kind}${compact ? ' ui-status--compact' : ''}`}>
    <button ref={trigger} type="button" aria-label={status} aria-expanded={false} aria-describedby={id}
      className="ui-status__trigger" onMouseEnter={show} onMouseLeave={scheduleHide} onFocus={show}
      onBlur={() => { if (!pinned.current) disclosure.current?.hidePopover() }}
      onClick={(event) => { event.stopPropagation(); pinned.current = true; show() }}>
      <Icon aria-hidden="true" size={14} strokeWidth={1.75} /><span className="ui-status__text">{status}</span>
    </button>
    <span ref={disclosure} id={id} popover="auto" role="tooltip" className="ui-status__disclosure"
      onMouseEnter={cancelHide} onMouseLeave={scheduleHide} onClick={(event) => event.stopPropagation()}
      onToggle={(event) => { const open = event.newState === 'open'; trigger.current?.setAttribute('aria-expanded', String(open)); if (!open) pinned.current = false }}>
      {status}
    </span>
  </span>
}
