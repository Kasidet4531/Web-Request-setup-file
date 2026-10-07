import type { FormSchemaField, FormSchemaJson } from './form_schema.constants';

export function isAutofillField(field: FormSchemaField): boolean {
  return ['text', 'textarea', 'number', 'date', 'select', 'radio'].includes(field.type);
}

export function getAutofillRuleSchemaState(
  rule: { triggerCanonicalKey: string; targetCanonicalKeys: string[] },
  schema: FormSchemaJson,
): { targetCanonicalKeys: string[]; inactiveReason: string | null } {
  const fields = schema.sections.flatMap((section) => section.fields);
  const exists = (key: string) => {
    const matches = fields.filter((field) => field.canonicalKey === key);
    return matches.length === 1 && isAutofillField(matches[0]);
  };
  const targetCanonicalKeys = rule.targetCanonicalKeys.filter(
    (key) => key !== rule.triggerCanonicalKey && exists(key),
  );
  return {
    targetCanonicalKeys,
    inactiveReason: !exists(rule.triggerCanonicalKey)
      ? 'Trigger field was removed from the published form.'
      : targetCanonicalKeys.length === 0
        ? 'All target fields were removed from the published form.'
        : null,
  };
}
