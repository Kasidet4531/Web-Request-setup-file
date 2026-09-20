import { describe, expect, it } from 'vitest'
import { isStandaloneAuthenticationPath } from './navigationState'

describe('isStandaloneAuthenticationPath', () => {
  it('keeps the login route out of the authenticated application shell', () => {
    expect(isStandaloneAuthenticationPath('/login')).toBe(true)
    expect(isStandaloneAuthenticationPath('/login/')).toBe(true)
    expect(isStandaloneAuthenticationPath('/requests')).toBe(false)
  })
})
