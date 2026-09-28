import type { FormControlType, FormSchemaDraft, FormSchemaField } from '../types/forms'

const FIELD_TYPE_LABELS: Record<FormControlType, string> = {
  text: 'Short text', textarea: 'Long text', date: 'Date', select: 'Dropdown', radio: 'Multiple choice',
}

interface AdminFormConfigEditorProps {
  schema: FormSchemaDraft
  disabled: boolean
  onChange: (schema: FormSchemaDraft) => void
}

export function AdminFormConfigEditor({ schema, disabled, onChange }: AdminFormConfigEditorProps) {
  function edit(update: (draft: FormSchemaDraft) => void) {
    const next = structuredClone(schema)
    update(next)
    onChange(next)
  }

  function addField(sectionIndex: number) {
    edit((draft) => {
      const used = new Set(draft.sections.flatMap((section) => section.fields.map((field) => field.fieldKey)))
      let index = 1
      while (used.has(`field_${index}`)) index += 1
      const key = `field_${index}`
      draft.sections[sectionIndex].fields.push({ fieldKey: key, canonicalKey: key, label: 'New field', type: 'text', required: false })
    })
  }

  function editField(sectionIndex: number, fieldIndex: number, update: (field: FormSchemaField) => void) {
    edit((draft) => update(draft.sections[sectionIndex].fields[fieldIndex]))
  }

  function move<T>(items: T[], index: number, target: number) {
    items.splice(target, 0, items.splice(index, 1)[0])
  }

  function addSection() {
    edit((draft) => {
      const used = new Set(draft.sections.map((section) => section.sectionKey))
      let index = 1
      while (used.has(`section_${index}`)) index += 1
      draft.sections.push({ sectionKey: `section_${index}`, title: 'New section', visibleTo: ['requester', 'setup_owner', 'admin'], fields: [] })
    })
  }

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
            <h3>{section.title || 'Untitled section'}</h3>
            <div className="admin-form-config__controls">
              <button aria-label={`Move ${section.title || section.sectionKey} up`} className="secondary-button" disabled={disabled || index === 0} onClick={() => edit((draft) => move(draft.sections, index, index - 1))} type="button">↑</button>
              <button aria-label={`Move ${section.title || section.sectionKey} down`} className="secondary-button" disabled={disabled || index === schema.sections.length - 1} onClick={() => edit((draft) => move(draft.sections, index, index + 1))} type="button">↓</button>
              <button aria-label={`Remove ${section.title || section.sectionKey}`} className="secondary-button" disabled={disabled || schema.sections.length === 1} onClick={() => {
                if (section.fields.length === 0 || window.confirm(`Remove ${section.title} and its ${section.fields.length} fields?`)) {
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
          <fieldset className="admin-form-config__roles" disabled={disabled}>
            <legend>Visible to</legend>
            {(['requester', 'setup_owner', 'admin'] as const).map((role) => (
              <label htmlFor={`form-config-role-${index}-${role}`} key={role}>
                <input checked={section.visibleTo.includes(role)} disabled={section.visibleTo.length === 1 && section.visibleTo.includes(role)} id={`form-config-role-${index}-${role}`} onChange={(event) => edit((draft) => {
                  draft.sections[index].visibleTo = event.target.checked
                    ? [...section.visibleTo, role]
                    : section.visibleTo.filter((value) => value !== role)
                })} type="checkbox" />
                {role === 'setup_owner' ? 'Setup owner' : role === 'requester' ? 'Requester' : 'Admin'}
              </label>
            ))}
          </fieldset>
          <div className="admin-form-config__fields">
            {section.fields.map((field, fieldIndex) => (
              <details className="admin-form-config__item" key={field.fieldKey}>
                <summary>
                  <strong>{fieldIndex + 1}. {field.label || 'Untitled field'}</strong>
                  <span>{!field.label.trim() || field.options?.some((option) => !option.trim()) ? 'Needs attention' : `${FIELD_TYPE_LABELS[field.type]} · ${field.required ? 'Required' : 'Optional'}`}</span>
                </summary>
                <div className="admin-form-config__item-body">
                  <label className="admin-form-config__field" htmlFor={`form-config-field-label-${index}-${fieldIndex}`}>
                    <span>Field label</span>
                    <input aria-describedby={!field.label.trim() ? `form-config-field-label-${index}-${fieldIndex}-error` : undefined} aria-invalid={!field.label.trim()} disabled={disabled} id={`form-config-field-label-${index}-${fieldIndex}`} onChange={(event) => editField(index, fieldIndex, (draft) => { draft.label = event.target.value })} value={field.label} />
                    {!field.label.trim() ? <small className="dynamic-form__error" id={`form-config-field-label-${index}-${fieldIndex}-error`}>Enter a field label.</small> : null}
                  </label>
                  <label className="admin-form-config__field" htmlFor={`form-config-field-type-${index}-${fieldIndex}`}>
                    <span>Field type</span>
                    <select disabled={disabled} id={`form-config-field-type-${index}-${fieldIndex}`} onChange={(event) => editField(index, fieldIndex, (draft) => {
                      draft.type = event.target.value as FormControlType
                      if (draft.type === 'select' || draft.type === 'radio') draft.options = draft.options?.length ? draft.options : ['Option 1']
                    })} value={field.type}>
                      <option value="text">Short text</option>
                      <option value="textarea">Long text</option>
                      <option value="date">Date</option>
                      <option value="select">Dropdown</option>
                      <option value="radio">Multiple choice</option>
                    </select>
                  </label>
                  <label className="admin-form-config__toggle">
                    <input checked={field.required} disabled={disabled} onChange={(event) => editField(index, fieldIndex, (draft) => { draft.required = event.target.checked })} type="checkbox" />
                    Required field
                  </label>
                  {field.type === 'select' || field.type === 'radio' ? (
                    <fieldset className="admin-form-config__options" disabled={disabled}>
                      <legend>Choices</legend>
                      {(field.options ?? []).map((option, optionIndex) => (
                        <div className="admin-form-config__choice" key={optionIndex}>
                          <label className="admin-form-config__field" htmlFor={`form-config-option-${index}-${fieldIndex}-${optionIndex}`}>
                            <span>Choice {optionIndex + 1}</span>
                            <input aria-describedby={!option.trim() ? `form-config-option-${index}-${fieldIndex}-${optionIndex}-error` : undefined} aria-invalid={!option.trim()} id={`form-config-option-${index}-${fieldIndex}-${optionIndex}`} onChange={(event) => editField(index, fieldIndex, (draft) => { draft.options![optionIndex] = event.target.value })} value={option} />
                            {!option.trim() ? <small className="dynamic-form__error" id={`form-config-option-${index}-${fieldIndex}-${optionIndex}-error`}>Enter a choice.</small> : null}
                          </label>
                          <button aria-label={`Remove choice ${optionIndex + 1} from ${field.label || field.fieldKey}`} className="secondary-button" disabled={disabled || (field.options?.length ?? 0) <= 1} onClick={() => editField(index, fieldIndex, (draft) => { draft.options!.splice(optionIndex, 1) })} type="button">Remove</button>
                        </div>
                      ))}
                      <button aria-label={`Add choice to ${field.label || field.fieldKey}`} className="secondary-button" disabled={disabled} onClick={() => editField(index, fieldIndex, (draft) => {
                        const options = draft.options ?? (draft.options = [])
                        let number = options.length + 1
                        while (options.includes(`Option ${number}`)) number += 1
                        options.push(`Option ${number}`)
                      })} type="button">Add choice</button>
                    </fieldset>
                  ) : null}
                  <small className="admin-form-config__key">Key: {field.fieldKey}</small>
                  <div className="admin-form-config__controls">
                    <button aria-label={`Move ${field.label || field.fieldKey} up`} className="secondary-button" disabled={disabled || fieldIndex === 0} onClick={() => edit((draft) => move(draft.sections[index].fields, fieldIndex, fieldIndex - 1))} type="button">↑ Move up</button>
                    <button aria-label={`Move ${field.label || field.fieldKey} down`} className="secondary-button" disabled={disabled || fieldIndex === section.fields.length - 1} onClick={() => edit((draft) => move(draft.sections[index].fields, fieldIndex, fieldIndex + 1))} type="button">↓ Move down</button>
                    <button aria-label={`Remove ${field.label || field.fieldKey}`} className="secondary-button" disabled={disabled || schema.sections.reduce((count, item) => count + item.fields.length, 0) === 1} onClick={() => {
                      if (window.confirm(`Remove ${field.label}?`)) edit((draft) => { draft.sections[index].fields.splice(fieldIndex, 1) })
                    }} type="button">Remove field</button>
                  </div>
                </div>
              </details>
            ))}
          </div>
          <button aria-label={`Add field to ${section.title || section.sectionKey}`} className="secondary-button admin-form-config__add-field" disabled={disabled} onClick={() => addField(index)} type="button">+ Add field</button>
        </section>
      ))}
      <button aria-label="Add section" className="secondary-button admin-form-config__add-section" disabled={disabled} onClick={addSection} type="button">+ Add section</button>
    </div>
  )
}
