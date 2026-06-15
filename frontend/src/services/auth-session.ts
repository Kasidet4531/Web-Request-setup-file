import type { AuthenticatedUserProfile } from './api'

export const AUTH_SESSION_CHANGED_EVENT = 'psf-auth-session-changed'

export type AuthSessionChangedDetail =
  | { status: 'authenticated'; user: AuthenticatedUserProfile }
  | { status: 'anonymous' }

function getBrowserEventTarget(): Window | null {
  return typeof window === 'undefined' ? null : window
}

export function notifyAuthSessionChanged(detail: AuthSessionChangedDetail) {
  const eventTarget = getBrowserEventTarget()

  if (!eventTarget) {
    return
  }

  eventTarget.dispatchEvent(new CustomEvent<AuthSessionChangedDetail>(AUTH_SESSION_CHANGED_EVENT, { detail }))
}

export function subscribeAuthSessionChanged(
  handler: (detail: AuthSessionChangedDetail) => void,
): () => void {
  const eventTarget = getBrowserEventTarget()

  if (!eventTarget) {
    return () => undefined
  }

  const listener = (event: Event) => {
    handler((event as CustomEvent<AuthSessionChangedDetail>).detail)
  }

  eventTarget.addEventListener(AUTH_SESSION_CHANGED_EVENT, listener)

  return () => eventTarget.removeEventListener(AUTH_SESSION_CHANGED_EVENT, listener)
}
