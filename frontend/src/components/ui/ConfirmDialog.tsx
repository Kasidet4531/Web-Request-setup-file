import { useEffect, useId, useRef, type ReactNode } from 'react'

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancel', pending = false, tone = 'default', onConfirm, onCancel }: {
  open: boolean; title: string; description?: ReactNode; confirmLabel: string; cancelLabel?: string; pending?: boolean;
  tone?: 'default' | 'danger'; onConfirm: () => void; onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('[data-dialog-cancel]')?.focus()
    return () => {
      if (dialog.open) dialog.close()
      triggerRef.current?.focus()
    }
  }, [open])

  return <dialog ref={dialogRef} className="ui-dialog" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); if (!pending) onCancel() }}
    onClick={(event) => { if (event.target === event.currentTarget && !pending) onCancel() }}>
    <div className="ui-dialog__body">
      <h2 id={titleId}>{title}</h2>
      {description ? <div id={descriptionId} className="ui-help">{description}</div> : null}
      <div className="ui-dialog__actions">
        <button className="ui-button ui-button--secondary" type="button" data-dialog-cancel disabled={pending} onClick={onCancel}>{cancelLabel}</button>
        <button className={`ui-button ui-button--${tone === 'danger' ? 'danger' : 'primary'}`} type="button" disabled={pending} onClick={onConfirm}>{pending ? 'Working…' : confirmLabel}</button>
      </div>
    </div>
  </dialog>
}
