import {
  ApiError,
  type AdminAutofillRule,
  type SaveAdminAutofillRulePayload,
} from '../services/api'

export type AdminAutofillRuleDraft = SaveAdminAutofillRulePayload

const MANAGED_FORM_KEY = 'psf-request'

export function createAdminAutofillRuleDraft(): AdminAutofillRuleDraft {
  return {
    formKey: MANAGED_FORM_KEY,
    triggerCanonicalKey: '',
    targetCanonicalKeys: [],
  }
}

export function toAdminAutofillRuleDraft(
  rule: Pick<
    AdminAutofillRule,
    'formKey' | 'triggerCanonicalKey' | 'targetCanonicalKeys'
  >,
): AdminAutofillRuleDraft {
  return {
    formKey: rule.formKey,
    triggerCanonicalKey: rule.triggerCanonicalKey,
    targetCanonicalKeys: [...rule.targetCanonicalKeys],
  }
}

export function setAdminAutofillRuleDraftTrigger(
  draft: AdminAutofillRuleDraft,
  triggerCanonicalKey: string,
): AdminAutofillRuleDraft {
  return {
    ...draft,
    triggerCanonicalKey,
    targetCanonicalKeys: draft.targetCanonicalKeys.filter(
      (targetCanonicalKey) => targetCanonicalKey !== triggerCanonicalKey,
    ),
  }
}

export function toggleAdminAutofillRuleDraftTarget(
  draft: AdminAutofillRuleDraft,
  targetCanonicalKey: string,
  checked: boolean,
): AdminAutofillRuleDraft {
  if (targetCanonicalKey === draft.triggerCanonicalKey) {
    return draft
  }

  if (checked) {
    return draft.targetCanonicalKeys.includes(targetCanonicalKey)
      ? draft
      : {
          ...draft,
          targetCanonicalKeys: [...draft.targetCanonicalKeys, targetCanonicalKey],
        }
  }

  return {
    ...draft,
    targetCanonicalKeys: draft.targetCanonicalKeys.filter(
      (current) => current !== targetCanonicalKey,
    ),
  }
}

export function canSaveAdminAutofillRuleDraft(
  draft: AdminAutofillRuleDraft,
): boolean {
  return (
    draft.formKey === MANAGED_FORM_KEY &&
    draft.triggerCanonicalKey.trim().length > 0 &&
    draft.targetCanonicalKeys.length > 0 &&
    draft.targetCanonicalKeys.every(
      (targetCanonicalKey) => targetCanonicalKey.trim().length > 0,
    ) &&
    !draft.targetCanonicalKeys.includes(draft.triggerCanonicalKey) &&
    new Set(draft.targetCanonicalKeys).size === draft.targetCanonicalKeys.length
  )
}

export function getAdminAutofillRuleErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallback
  }

  return fallback
}
