import { BadRequestException } from '@nestjs/common';
import type { FormSchemaJson } from '../admin/form_schema.constants';

export function validateAndNormalizeFormData(
  schema: FormSchemaJson,
  input: unknown,
  options: { allowMissingRequired: boolean },
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new BadRequestException('Form information must be a JSON object.');
  }

  const fields = new Map(
    schema.sections.flatMap((section) =>
      section.fields.map((field) => [field.fieldKey, field] as const),
    ),
  );
  const data: Record<string, unknown> = {};

  for (const [fieldKey, rawValue] of Object.entries(input)) {
    const field = fields.get(fieldKey);
    if (!field || Object.hasOwn(Object.prototype, fieldKey)) {
      throw new BadRequestException(`Unknown form field: ${fieldKey}.`);
    }
    if (
      rawValue !== null &&
      rawValue !== undefined &&
      typeof rawValue !== 'string'
    ) {
      throw new BadRequestException(`${field.label} must be a string.`);
    }

    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (
      value &&
      (field.type === 'select' || field.type === 'radio') &&
      !field.options?.includes(value)
    ) {
      throw new BadRequestException(
        `${field.label} must be one of the configured options.`,
      );
    }
    if (value && field.type === 'number' && !isNumericText(value)) {
      throw new BadRequestException(`${field.label} must be a number.`);
    }
    if (value && field.type === 'date' && !isCalendarDate(value)) {
      throw new BadRequestException(
        `${field.label} must be a valid ISO calendar date.`,
      );
    }

    Object.defineProperty(data, fieldKey, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  if (!options.allowMissingRequired) {
    const missing = schema.sections.flatMap((section) =>
      section.fields
        .filter(
          (field) =>
            field.required &&
            (!Object.hasOwn(data, field.fieldKey) || !data[field.fieldKey]),
        )
        .map((field) => field.label),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Form information is missing required fields: ${missing.join(', ')}.`,
      );
    }
  }

  return data;
}

export function assertValidRequiredFormData(
  schema: FormSchemaJson,
  input: unknown,
  label: string,
): void {
  try {
    validateAndNormalizeFormData(schema, input, {
      allowMissingRequired: false,
    });
  } catch (error) {
    if (error instanceof BadRequestException) {
      const message = error.message.replace(/^Form information/, label);
      throw new BadRequestException(message);
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNumericText(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
