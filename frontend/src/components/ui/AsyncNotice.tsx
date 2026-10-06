import type { ReactNode } from 'react'
import { CircleCheck, CircleAlert, Info, LoaderCircle, Inbox } from 'lucide-react'

type NoticeKind = 'loading' | 'empty' | 'error' | 'success' | 'info'
const icons = { loading: LoaderCircle, empty: Inbox, error: CircleAlert, success: CircleCheck, info: Info }

export function AsyncNotice({ kind, title, children, action }: { kind: NoticeKind; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = icons[kind]
  return <div className={`ui-notice ui-notice--${kind}`} role={kind === 'error' ? 'alert' : kind === 'empty' ? undefined : 'status'}>
    <Icon aria-hidden="true" size={16} />
    <div><strong>{title}</strong>{children ? <div className="ui-notice__detail">{children}</div> : null}</div>
    {action ? <div className="ui-notice__action">{action}</div> : null}
  </div>
}
