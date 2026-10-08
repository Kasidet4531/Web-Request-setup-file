import { BadRequestException } from '@nestjs/common';
import { FormSchemaJson } from '../admin/form_schema.service';
import { validateAndNormalizeFormData } from './form-data-validation';

const schema: FormSchemaJson = {
  formKey: 'psf-request',
  version: 1,
  title: 'Snapshot',
  sections: [
    {
      sectionKey: 'information',
      title: 'Information',
      fields: [
        {
          fieldKey: 'name',
          canonicalKey: 'name',
          label: 'Name',
          type: 'text',
          required: true,
        },
        {
          fieldKey: 'stage',
          canonicalKey: 'stage',
          label: 'Stage',
          type: 'select',
          required: false,
          options: ['Ready', 'Hold'],
        },
        {
          fieldKey: 'count',
          canonicalKey: 'count',
          label: 'Count',
          type: 'number',
          required: false,
        },
        {
          fieldKey: 'date',
          canonicalKey: 'date',
          label: 'Date',
          type: 'date',
          required: false,
        },
      ],
    },
  ],
};

describe('validateAndNormalizeFormData', () => {
  it('accepts plain decimal numbers and rejects other text in number fields', () => {
    const run = (count: string) =>
      validateAndNormalizeFormData(
        schema,
        { count },
        { allowMissingRequired: true },
      );
    expect(run('-12.5')).toEqual({ count: '-12.5' });
    expect(run('')).toEqual({ count: '' });
    for (const bad of ['NA', '1e3', '1,000', '12.'])
      expect(() => run(bad)).toThrow(BadRequestException);
  });

  it('allows required omissions in Draft but still rejects invalid populated values', () => {
    expect(
      validateAndNormalizeFormData(
        schema,
        { name: '' },
        { allowMissingRequired: true },
      ),
    ).toEqual({ name: '' });
    expect(() =>
      validateAndNormalizeFormData(
        schema,
        { stage: 'Unknown' },
        { allowMissingRequired: true },
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateAndNormalizeFormData(
        schema,
        { date: '2026-02-30' },
        { allowMissingRequired: true },
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateAndNormalizeFormData(
        schema,
        { name: 3 },
        { allowMissingRequired: true },
      ),
    ).toThrow(BadRequestException);
  });

  it('requires captured-schema fields for shared saves and rejects unknown keys', () => {
    expect(() =>
      validateAndNormalizeFormData(
        schema,
        { stage: 'Ready' },
        { allowMissingRequired: false },
      ),
    ).toThrow(/Name/);
    expect(() =>
      validateAndNormalizeFormData(
        schema,
        { name: 'Fook', extra: 'secret' },
        { allowMissingRequired: true },
      ),
    ).toThrow(/Unknown/);
    expect(
      validateAndNormalizeFormData(
        schema,
        { name: ' Fook ', stage: ' Ready ' },
        { allowMissingRequired: false },
      ),
    ).toEqual({ name: 'Fook', stage: 'Ready' });
  });
});
