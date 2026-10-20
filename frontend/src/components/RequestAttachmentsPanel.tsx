import { useEffect, useId, useRef, useState } from 'react'
import { Download, FileText, Image, Paperclip, Trash2, X } from 'lucide-react'
import { AsyncNotice } from './ui/AsyncNotice'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { formatFileSize } from './ui/fileSize'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { api, type RequestAttachment, type RequestAttachmentList } from '../services/api'

// The server refuses these too; staging checks them before a Draft exists.
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.sh', '.vbs']

function blockedFileName(files: File[]): string | null {
  return files.find((file) => BLOCKED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension)))?.name ?? null
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function AttachmentFilePicker({ disabled, label, onSelect }: { disabled: boolean; label: string; onSelect: (files: File[]) => void }) {
  const inputId = useId()
  return (
    <label className={`btn-secondary request-attachments__picker${disabled ? ' is-disabled' : ''}`} htmlFor={inputId}>
      <Paperclip size={14} aria-hidden="true" /> {label}
      <input
        className="sr-only"
        disabled={disabled}
        id={inputId}
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) onSelect(files)
        }}
        type="file"
      />
    </label>
  )
}

export function ImagePreviewModal({ attachment, downloadUrl, onClose }: { attachment: RequestAttachment; downloadUrl: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('[data-dialog-close]')?.focus()
    return () => {
      if (dialog.open) dialog.close()
      trigger?.focus()
    }
  }, [])

  return (
    <dialog ref={dialogRef} className="ui-dialog image-preview-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="ui-dialog__body">
        <div className="image-preview-dialog__header">
          <h2 id={titleId}>{attachment.filename}</h2>
          <button className="ui-button ui-button--secondary" data-dialog-close type="button" aria-label="Close preview" onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        <img className="image-preview-dialog__image" src={downloadUrl} alt={attachment.filename} />
        <div className="ui-dialog__actions">
          <a className="ui-button ui-button--primary" href={downloadUrl} download={attachment.filename}><Download size={14} aria-hidden="true" /> Download</a>
        </div>
      </div>
    </dialog>
  )
}

/** Attachments of a saved request: listed from its NAS folder, changed immediately. */
export function RequestAttachmentsPanel({ requestId, reloadKey, onChanged }: { requestId: string; reloadKey?: unknown; onChanged?: () => void }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: RequestAttachmentList | null }>({ loading: true, error: null, data: null })
  const [retry, setRetry] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<RequestAttachment | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [preview, setPreview] = useState<RequestAttachment | null>(null)

  // Each load reconciles the list with the request's NAS folder.
  useEffect(() => {
    let active = true
    async function loadAttachments() {
      setState((current) => ({ ...current, loading: true, error: null }))
      try {
        const data = await api.fetchRequestAttachments(requestId)
        if (active) setState({ loading: false, error: null, data })
      } catch (error) {
        if (active) setState({ loading: false, error: errorMessage(error, 'Unable to load attachments'), data: null })
      }
    }
    void loadAttachments()
    return () => { active = false }
  }, [requestId, reloadKey, retry])

  async function upload(files: File[]) {
    setUploading(true)
    setActionError(null)
    setMessage(null)
    let uploaded = 0
    try {
      const data = await api.uploadRequestAttachments(requestId, files, (batch, partial) => {
        uploaded += batch.length
        setState({ loading: false, error: null, data: partial })
      })
      uploaded = files.length
      setState({ loading: false, error: null, data })
      setMessage(`${files.length === 1 ? files[0].name : `${files.length} files`} uploaded.`)
    } catch (error) {
      const progress = uploaded ? ` (${uploaded} of ${files.length} files were uploaded)` : ''
      setActionError(`Upload failed: ${errorMessage(error, 'Unable to upload attachments')}${progress}`)
    } finally {
      if (uploaded) onChanged?.()
      setUploading(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setActionError(null)
    setMessage(null)
    try {
      await api.deleteRequestAttachment(requestId, deleting.id)
      setState((current) => current.data ? { ...current, data: { ...current.data, items: current.data.items.filter((item) => item.id !== deleting.id) } } : current)
      setMessage(`${deleting.filename} deleted.`)
      onChanged?.()
    } catch (error) {
      setActionError(`Delete failed: ${errorMessage(error, 'Unable to delete the attachment')}`)
    } finally {
      setDeletePending(false)
      setDeleting(null)
    }
  }

  const list = state.data
  return (
    <section className="request-attachments" aria-labelledby={`attachments-heading-${requestId}`}>
      <div className="request-attachments__header">
        <div>
          <h2 id={`attachments-heading-${requestId}`}>Attachments</h2>
          {list ? <p className="request-attachments__folder">NAS folder: <span className="font-mono-code">{list.folderName}</span></p> : null}
        </div>
        {list?.canManage ? <AttachmentFilePicker disabled={uploading} label={uploading ? 'Uploading…' : 'Upload files'} onSelect={(files) => void upload(files)} /> : null}
      </div>
      {state.loading && !list ? <AsyncNotice kind="loading" title="Loading attachments…" /> : null}
      {state.error ? <AsyncNotice kind="error" title={`Unable to load attachments: ${state.error}`} action={<button className="btn-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Retry attachments</button>} /> : null}
      {actionError ? <AsyncNotice kind="error" title={actionError} /> : null}
      {message ? <p className="sr-only" role="status">{message}</p> : null}
      {list && list.items.length === 0 ? <p className="page-card__description" role="status">No attachments yet.</p> : null}
      {list && list.items.length > 0 ? (
        <ul className="request-attachments__list">
          {list.items.map((item) => {
            const downloadUrl = api.requestAttachmentDownloadUrl(requestId, item.id)
            return (
              <li key={item.id}>
                {item.isImage ? (
                  <button className="request-attachments__name" type="button" onClick={() => setPreview(item)}>
                    <Image size={16} aria-hidden="true" /> {item.filename}
                  </button>
                ) : (
                  <a className="request-attachments__name" href={downloadUrl} download={item.filename}>
                    <FileText size={16} aria-hidden="true" /> {item.filename}
                  </a>
                )}
                <span className="request-attachments__meta">
                  {formatFileSize(item.sizeBytes)} · {item.uploadedByDisplayName ?? 'Added on the NAS'} · <time dateTime={item.createdAt}>{formatHistoryDateTime(item.createdAt)}</time>
                </span>
                {list.canManage ? (
                  <button className="ui-button ui-button--secondary request-attachments__delete" type="button" aria-label={`Delete ${item.filename}`} disabled={uploading || deletePending} onClick={() => setDeleting(item)}>
                    <Trash2 size={14} aria-hidden="true" /> Delete
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {preview ? <ImagePreviewModal attachment={preview} downloadUrl={api.requestAttachmentDownloadUrl(requestId, preview.id)} onClose={() => setPreview(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete attachment?"
        description={deleting ? `${deleting.filename} will be permanently deleted from the request folder on the NAS.` : undefined}
        confirmLabel="Delete attachment"
        tone="danger"
        pending={deletePending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

/** Files chosen on New Request before its Draft exists; uploaded once it is saved. */
export function StagedAttachmentsPanel({ files, disabled = false, error, onChange }: { files: File[]; disabled?: boolean; error?: string | null; onChange: (files: File[]) => void }) {
  const [rejected, setRejected] = useState<string | null>(null)
  return (
    <section className="request-attachments" aria-labelledby="staged-attachments-heading">
      <div className="request-attachments__header">
        <div>
          <h2 id="staged-attachments-heading">Attachments</h2>
          <p className="request-attachments__folder">Uploaded to the request folder on the NAS when the Draft is saved.</p>
        </div>
        <AttachmentFilePicker disabled={disabled} label="Add files" onSelect={(selected) => {
          const blocked = blockedFileName(selected)
          setRejected(blocked ? `${blocked} cannot be attached: executable and script files are not allowed.` : null)
          if (!blocked) onChange([...files, ...selected])
        }} />
      </div>
      {rejected ? <AsyncNotice kind="error" title={rejected} /> : null}
      {error ? <AsyncNotice kind="error" title={error} /> : null}
      {files.length === 0 ? <p className="page-card__description">No attachments selected.</p> : (
        <ul className="request-attachments__list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span className="request-attachments__name"><FileText size={16} aria-hidden="true" /> {file.name}</span>
              <span className="request-attachments__meta">{formatFileSize(file.size)} · Not uploaded yet</span>
              <button className="ui-button ui-button--secondary request-attachments__delete" type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onChange(files.filter((_, position) => position !== index))}>
                <X size={14} aria-hidden="true" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
