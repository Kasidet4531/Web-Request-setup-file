import { describe, expect, it } from 'vitest'
import { ApiError, type AdminAutofillRule } from '../services/api'
import {
  canSaveAdminAutofillRuleDraft,
  createAdminAutofillRuleDraft,
  getAdminAutofillRuleErrorMessage,
  setAdminAutofillRuleDraftTrigger,
  toAdminAutofillRuleDraft,
  toggleAdminAutofillRuleDraftTarget,
} from './adminAutofillRulesState'

const savedRule: AdminAutofillRule = {
  id: 'cadb0943-a117-421a-9100-50c89d0c1d0a',
  formKey: 'psf-request',
  triggerCanonicalKey: 'reference_psf_name',
  targetCanonicalKeys: ['product', 'wafer_fab'],
  lookupSource: 'previous_completed_submission',
  status: 'active',
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:00:00.000Z',
}

describe('admin autofill rule state helpers', () => {
  it('creates and restores drafts with canonical keys rather than labels', () => {
    expect(createAdminAutofillRuleDraft()).toEqual({
      formKey: 'psf-request',
      triggerCanonicalKey: '',
      targetCanonicalKeys: [],
    })
    expect(toAdminAutofillRuleDraft(savedRule)).toEqual({
      formKey: 'psf-request',
      triggerCanonicalKey: 'reference_psf_name',
      targetCanonicalKeys: ['product', 'wafer_fab'],
    })
  })

  it('keeps targets unique and removes a newly selected trigger from the target draft', () => {
    const initial = toAdminAutofillRuleDraft(savedRule)
    const changedTrigger = setAdminAutofillRuleDraftTrigger(initial, 'product')

    expect(changedTrigger).toEqual({
      formKey: 'psf-request',
      triggerCanonicalKey: 'product',
      targetCanonicalKeys: ['wafer_fab'],
    })
    expect(
      toggleAdminAutofillRuleDraftTarget(changedTrigger, 'wafer_fab', true),
    ).toEqual(changedTrigger)
    expect(
      toggleAdminAutofillRuleDraftTarget(changedTrigger, 'product', true),
    ).toEqual(changedTrigger)
    expect(
      toggleAdminAutofillRuleDraftTarget(changedTrigger, 'wafer_fab', false),
    ).toEqual({
      ...changedTrigger,
      targetCanonicalKeys: [],
    })
  })

  it('allows only a complete non-self-targeting draft to save and preserves server error messages', () => {
    expect(canSaveAdminAutofillRuleDraft(savedRule)).toBe(true)
    expect(
      canSaveAdminAutofillRuleDraft({
        ...savedRule,
        targetCanonicalKeys: [],
      }),
    ).toBe(false)
    expect(
      canSaveAdminAutofillRuleDraft({
        ...savedRule,
        targetCanonicalKeys: ['reference_psf_name'],
      }),
    ).toBe(false)
    expect(
      canSaveAdminAutofillRuleDraft({
        ...savedRule,
        targetCanonicalKeys: ['product', 'product'],
      }),
    ).toBe(false)
    expect(
      getAdminAutofillRuleErrorMessage(
        new ApiError('Rule already exists.', 409, 'Conflict', null),
        'Unable to save autofill rule.',
      ),
    ).toBe('Rule already exists.')
  })
})
