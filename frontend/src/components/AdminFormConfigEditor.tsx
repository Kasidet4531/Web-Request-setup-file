import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import type { FormControlType, FormSchemaDraft, FormSchemaField } from '../types/forms'

const FIELD_TYPE_LABELS: Record<FormControlType, string> = {
  text: 'Short text', textarea: 'Long text', date: 'Date', select: 'Dropdown', radio: 'Multiple choice',
}

interface AdminFormConfigEditorProps {
  schema: FormSchemaDraft
  disabled: boolean
  readOnly?: boolean
  onChange: (schema: FormSchemaDraft) => void
  onEditField: (sectionIndex: number, fieldIndex: number | null, field: FormSchemaField, trigger: HTMLButtonElement) => void
}

export function AdminFormConfigEditor({ schema, disabled, readOnly = false, onChange, onEditField }: AdminFormConfigEditorProps) {
  function edit(update: (draft: FormSchemaDraft) => void) {
    const next = structuredClone(schema)
    update(next)
    onChange(next)
  }

  function addField(sectionIndex: number, trigger: HTMLButtonElement) {
    const used = new Set(schema.sections.flatMap((section) => section.fields.map((field) => field.fieldKey)))
    let index = 1
    while (used.has(`field_${index}`)) index += 1
    const key = `field_${index}`
    onEditField(sectionIndex, null, { fieldKey: key, canonicalKey: key, label: 'New field', type: 'text', required: false }, trigger)
  }

  function move<T>(items: T[], index: number, target: number) {
    items.splice(target, 0, items.splice(index, 1)[0])
  }

  function addSection() {
    edit((draft) => {
      const used = new Set(draft.sections.map((section) => section.sectionKey))
      let index = 1
      while (used.has(`section_${index}`)) index += 1
      draft.sections.push({ sectionKey: `section_${index}`, title: 'New section', fields: [] })
    })
  }

  if (readOnly) return (
    <div className="admin-form-config__builder admin-form-config__builder--readonly">
      <p><strong>Form title:</strong> {schema.title}</p>
      {schema.sections.map((section) => (
        <section className="admin-form-config__section" key={section.sectionKey}>
          <div><h2>{section.title}</h2><span className="admin-form-config__key">Section key: {section.sectionKey}</span></div>
          <ol className="admin-form-config__read-fields">
            {section.fields.map((field) => <li key={field.fieldKey}>
              <strong>{field.label}</strong>
              <span>{FIELD_TYPE_LABELS[field.type]} · {field.required ? 'Required' : 'Optional'}</span>
              <span className="admin-form-config__key">Field key: {field.fieldKey} · Canonical key: {field.canonicalKey ?? 'None'}</span>
              {field.options?.length ? <span>Choices: {field.options.join(', ')}</span> : null}
            </li>)}
          </ol>
        </section>
      ))}
    </div>
  )
  return (
    <div className="admin-form-config__builder">
      <label className="admin-form-config__field" htmlFor="form-config-title">
        <span>Form title</span>
        <input aria-describedby={!schema.title.trim() ? 'form-config-title-error' : undefined} aria-invalid={!schema.title.trim()} disabled={disabled} id="form-config-title" onChange={(event) => edit((draft) => { draft.title = event.target.value })} value={schema.title} />
        {!schema.title.trim() ? <small className="dynamic-form__error" id="form-config-title-error">Enter a form title.</small> : null}
      </label>
      {schema.sections.map((section, index) => (
        <section className="admin-form-config__section" key={section.sectionKey}>
          <div className="admin-form-config__section-top">
            <div><h2>{section.title || 'Untitled section'}</h2><span className="admin-form-config__key">Section key: {section.sectionKey} · {section.fields.length} {section.fields.length === 1 ? 'field' : 'fields'}</span></div>
            <div className="admin-form-config__controls">
              <button aria-label={`Move ${section.title || section.sectionKey} up`} className="secondary-button" disabled={disabled || index === 0} onClick={() => edit((draft) => move(draft.sections, index, index - 1))} type="button"><ArrowUp aria-hidden="true" size={16} /></button>
              <button aria-label={`Move ${section.title || section.sectionKey} down`} className="secondary-button" disabled={disabled || index === schema.sections.length - 1} onClick={() => edit((draft) => move(draft.sections, index, index + 1))} type="button"><ArrowDown aria-hidden="true" size={16} /></button>
              <button aria-label={`Remove ${section.title || section.sectionKey}`} className="secondary-button" disabled={disabled || schema.sections.length === 1} onClick={() => {
                if (section.fields.length === 0 || window.confirm(`Remove ${section.title} and its ${section.fields.length} ${section.fields.length === 1 ? 'field' : 'fields'}?`)) {
                  edit((draft) => { draft.sections.splice(index, 1) })
                }
              }} type="button">Remove section</button>
            </div>
          </div>
          <label className="admin-form-config__field" htmlFor={`form-config-section-${index}`}>
            <span>Section title</span>
            <input aria-describedby={!section.title.trim() ? `form-config-section-${index}-error` : undefined} aria-invalid={!section.title.trim()} disabled={disabled} id={`form-config-section-${index}`} onChange={(event) => edit((draft) => { draft.sections[index].title = event.target.value })} value={section.title} />
            {!section.title.trim() ? <small className="dynamic-form__error" id={`form-config-section-${index}-error`}>Enter a section title.</small> : null}
          </label>
          <div className="admin-form-config__fields">
            {section.fields.map((field, fieldIndex) => (
              <div className="admin-form-config__item" key={field.fieldKey}>
                <div className="admin-form-config__item-summary">
                  <strong>{fieldIndex + 1}. {field.label || 'Untitled field'}</strong>
                  <span className="admin-form-config__key">{field.fieldKey} · {field.canonicalKey ?? 'No canonical key'}</span>
                  <span>{!field.label.trim() || field.options?.some((option) => !option.trim()) ? 'Needs attention' : `${FIELD_TYPE_LABELS[field.type]} · ${field.required ? 'Required' : 'Optional'}`}</span>
                </div>
                <div className="admin-form-config__controls">
                  <button aria-label={`Edit ${field.label || field.fieldKey}`} className="secondary-button" disabled={disabled} onClick={(event) => onEditField(index, fieldIndex, field, event.currentTarget)} type="button">Edit</button>
                  <button aria-label={`Move ${field.label || field.fieldKey} up`} className="secondary-button" disabled={disabled || fieldIndex === 0} onClick={() => edit((draft) => move(draft.sections[index].fields, fieldIndex, fieldIndex - 1))} type="button"><ArrowUp aria-hidden="true" size={16} /></button>
                  <button aria-label={`Move ${field.label || field.fieldKey} down`} className="secondary-button" disabled={disabled || fieldIndex === section.fields.length - 1} onClick={() => edit((draft) => move(draft.sections[index].fields, fieldIndex, fieldIndex + 1))} type="button"><ArrowDown aria-hidden="true" size={16} /></button>
                </div>
              </div>
            ))}
          </div>
          <button aria-label={`Add field to ${section.title || section.sectionKey}`} className="secondary-button admin-form-config__add-field" disabled={disabled} onClick={(event) => addField(index, event.currentTarget)} type="button"><Plus aria-hidden="true" size={16} /> Add field</button>
        </section>
      ))}
      <button aria-label="Add section" className="secondary-button admin-form-config__add-section" disabled={disabled} onClick={addSection} type="button"><Plus aria-hidden="true" size={16} /> Add section</button>
    </div>
  )
}

interface AdminFormConfigFieldEditorProps {
  field: FormSchemaField
  isNew: boolean
  canRemove: boolean
  onChange: (field: FormSchemaField) => void
  onApply: () => void
  onCancel: () => void
  onRemove: () => void
}

export function AdminFormConfigFieldEditor({ field, isNew, canRemove, onChange, onApply, onCancel, onRemove }: AdminFormConfigFieldEditorProps) {
  const choiceField = field.type === 'select' || field.type === 'radio'
  const valid = !!field.label.trim() && (!choiceField || !!field.options?.length && field.options.every((option) => option.trim()))
  function edit(update: (draft: FormSchemaField) => void) {
    const next = structuredClone(field)
    update(next)
    onChange(next)
  }

  return (
    <form className="admin-form-config__modal-body" onSubmit={(event) => { event.preventDefault(); if (valid) onApply() }}>
      <div className="admin-form-config__modal-head">
        <div><h2 id="form-config-field-dialog-title">{isNew ? 'Add field' : 'Edit field'}</h2><p>Changes stay in the page draft until you save it.</p></div>
        <button aria-label="Close field editor" className="icon-button" onClick={onCancel} type="button"><X aria-hidden="true" size={16} /></button>
      </div>
      <div className="admin-form-config__field-properties">
      <label className="admin-form-config__field" htmlFor="form-config-field-label">
        <span>Field label</span>
        <input aria-describedby={!field.label.trim() ? 'form-config-field-label-error' : undefined} aria-invalid={!field.label.trim()} id="form-config-field-label" onChange={(event) => edit((draft) => { draft.label = event.target.value })} value={field.label} />
        {!field.label.trim() ? <small className="dynamic-form__error" id="form-config-field-label-error">Enter a field label.</small> : null}
      </label>
      <label className="admin-form-config__field" htmlFor="form-config-field-type">
        <span>Field type</span>
        <select id="form-config-field-type" onChange={(event) => edit((draft) => {
          draft.type = event.target.value as FormControlType
          if ((draft.type === 'select' || draft.type === 'radio') && !draft.options?.length) draft.options = ['Option 1']
        })} value={field.type}>
          {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select>
      </label>
      </div>
      <label className="admin-form-config__toggle">
        <input checked={field.required} onChange={(event) => edit((draft) => { draft.required = event.target.checked })} type="checkbox" />
        Required field
      </label>
      {choiceField ? (
        <fieldset className="admin-form-config__options">
          <legend>Choices</legend>
          <div className="admin-form-config__choice-list">
            {(field.options ?? []).map((option, index) => (
              <div className="admin-form-config__choice" key={index}>
                <label className="admin-form-config__field" htmlFor={`form-config-option-${index}`}>
                  <span>Choice {index + 1}</span>
                  <input aria-describedby={!option.trim() ? `form-config-option-${index}-error` : undefined} aria-invalid={!option.trim()} id={`form-config-option-${index}`} onChange={(event) => edit((draft) => { draft.options![index] = event.target.value })} value={option} />
                  {!option.trim() ? <small className="dynamic-form__error" id={`form-config-option-${index}-error`}>Enter a choice.</small> : null}
                </label>
                <button aria-label={`Remove choice ${index + 1} from ${field.label || field.fieldKey}`} className="secondary-button" disabled={field.options?.length === 1} onClick={() => edit((draft) => { draft.options!.splice(index, 1) })} type="button">Remove</button>
              </div>
            ))}
            <button aria-label={`Add choice to ${field.label || field.fieldKey}`} className="secondary-button" onClick={() => edit((draft) => {
              const options = draft.options ?? (draft.options = [])
              let number = options.length + 1
              while (options.includes(`Option ${number}`)) number += 1
              options.push(`Option ${number}`)
            })} type="button"><Plus aria-hidden="true" size={16} /> Add choice</button>
          </div>
        </fieldset>
      ) : null}
      <div className="admin-form-config__identity"><span className="admin-form-config__key">Field key: {field.fieldKey}</span><span className="admin-form-config__key">Canonical key: {field.canonicalKey ?? 'None'}</span><small className="ui-help">Stable keys retain the identity of saved values.</small></div>
      <div className="admin-form-config__modal-actions">
        {!isNew ? <button className="secondary-button admin-form-config__danger" disabled={!canRemove} onClick={onRemove} type="button">Remove field</button> : null}
        <div className="admin-form-config__actions">
          <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
          <button className="primary-button" disabled={!valid} type="submit">Apply</button>
        </div>
      </div>
    </form>
  )
}
