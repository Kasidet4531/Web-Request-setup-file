import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_CHANGED_EVENT,
  notifyAuthSessionChanged,
  subscribeAuthSessionChanged,
  type AuthSessionChangedDetail,
} from './auth-session'

class TestCustomEvent<T> extends Event {
  detail: T

  constructor(type: string, init: CustomEventInit<T>) {
    super(type)
    this.detail = init.detail as T
  }
}

describe('auth session notifications', () => {
  const originalWindow = globalThis.window
  const originalCustomEvent = globalThis.CustomEvent

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
      writable: true,
    })
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: originalCustomEvent,
      writable: true,
    })
  })

  it('notifies active subscribers when the session becomes authenticated', () => {
    const target = new EventTarget()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: target,
      writable: true,
    })
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: TestCustomEvent,
      writable: true,
    })

    const handler = vi.fn<(detail: AuthSessionChangedDetail) => void>()
    const unsubscribe = subscribeAuthSessionChanged(handler)

    notifyAuthSessionChanged({
      status: 'authenticated',
      user: {
        id: 'user-1',
        username: 'admin.demo',
        displayName: 'Admin Demo',
        role: 'admin',
        setupOwnerDepartment: null,
      },
    })

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      status: 'authenticated',
      user: expect.objectContaining({ username: 'admin.demo' }),
    }))

    unsubscribe()
    notifyAuthSessionChanged({ status: 'anonymous' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatches the documented browser event name', () => {
    const target = new EventTarget()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: target,
      writable: true,
    })
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: TestCustomEvent,
      writable: true,
    })

    const listener = vi.fn()
    target.addEventListener(AUTH_SESSION_CHANGED_EVENT, listener)

    notifyAuthSessionChanged({ status: 'anonymous' })

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
