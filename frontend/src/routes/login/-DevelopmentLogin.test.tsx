import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DevelopmentLogin } from './-DevelopmentLogin'
import { subscribeAuthSessionChanged } from '../../services/auth-session'

const hooks = vi.hoisted(() => {
  let values: unknown[] = []
  let index = 0
  return {
    reset: () => { values = []; index = 0 },
    begin: () => { index = 0 },
    navigate: vi.fn(),
    useState: (initial: unknown) => {
      const slot = index++
      if (slot === values.length) values.push(initial)
      return [values[slot], (next: unknown) => { values[slot] = next }]
    },
  }
})
vi.mock('react', async (load) => ({ ...await load<typeof import('react')>(), useState: hooks.useState }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => hooks.navigate }))

function render(redirectTo?: string) {
  hooks.begin()
  return DevelopmentLogin({ redirectTo })
}

beforeEach(() => {
  hooks.reset()
  hooks.navigate.mockReset()
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => vi.unstubAllGlobals())

describe('local account login interaction', () => {
  it('sends the selected identity with cookies, notifies the shared session and opens the dashboard', async () => {
    const user = { id: 'dev-id', username: 'dev.admin', displayName: 'Development Administrator', role: 'admin', setupOwnerDepartment: null }
    let complete!: (response: Response) => void
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve }))
    vi.stubGlobal('fetch', fetch)
    const events: unknown[] = []
    const unsubscribe = subscribeAuthSessionChanged((event) => events.push(event))
    try {
      const section = render()
      const buttons = section.props.children[2].props.children
      buttons[3].props.onClick()
      expect(render().props.children[2].props.children.every((button: { props: { disabled: boolean } }) => button.props.disabled)).toBe(true)
      expect(fetch).toHaveBeenCalledWith('/api/dev/login', expect.objectContaining({
        method: 'POST', credentials: 'include', body: '{"identity":"admin"}',
      }))
      complete(new Response(JSON.stringify({ user }), { headers: { 'content-type': 'application/json' } }))
      await vi.waitFor(() => expect(hooks.navigate).toHaveBeenCalledWith({ href: '/dashboard', replace: true }))
      expect(events).toEqual([{ status: 'authenticated', user }])
      expect(render().props.children[2].props.children[3].props.disabled).toBe(false)
    } finally { unsubscribe() }
  })

  it('returns to the requested internal URL after signing in', async () => {
    const user = { id: 'dev-id', username: 'dev.admin', displayName: 'Admin', role: 'admin', setupOwnerDepartment: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ user }), { headers: { 'content-type': 'application/json' } })))
    render('/requests?scope=related#details').props.children[2].props.children[0].props.onClick()
    await vi.waitFor(() => expect(hooks.navigate).toHaveBeenCalledWith({ href: '/requests?scope=related#details', replace: true }))
  })

  it('shows backend errors and enables retry without navigating', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Not Found' }), {
      status: 404, headers: { 'content-type': 'application/json' },
    })))
    render().props.children[2].props.children[0].props.onClick()
    await vi.waitFor(() => {
      const error = render().props.children.find((child: { props: { kind?: string; title?: string } } | null) => child?.props.kind === 'error')
      expect(error && error.props.title).toBe('Not Found')
    })
    expect(hooks.navigate).not.toHaveBeenCalled()
    expect(render().props.children[2].props.children[0].props.disabled).toBe(false)
  })
})
