# 7. Admin JSON Schema Editor with Verification Aids

We decided to implement a JSON Schema Editor for the MVP Admin page to manage form definitions, coupled with helper tools (syntax highlighting, templates, and validation checks), rejecting a visual drag-and-drop form builder for the initial phase.

## Context

Admins need to manage form schemas (adding, removing, or modifying fields, sections, and validation rules). Building a visual, drag-and-drop form editor (similar to Google Forms) is highly intuitive but demands significant development overhead. However, asking admins to write raw JSON in a plain text area is error-prone and offers a poor user experience.

## Decision

We chose to implement a developer/admin-friendly JSON Schema Editor for the MVP:
- **Monaco Editor / CodeMirror Integration**: The Admin page will integrate a structured editor providing syntax highlighting, brackets matching, and syntax error indicators.
- **Form Templates**: The editor will include one-click boilerplate injection buttons (e.g., "Add Standard Text Field", "Add Select Dropdown", "Add Attachment Field") so admins can copy-paste structure without writing JSON syntax from scratch.
- **Backend and Frontend Validation**:
  - The application will validate JSON syntax in real-time.
  - A custom schema validator will run before publishing, ensuring no duplicate `fieldKey`s exist, `canonicalKey`s are valid, and status-based visibility rules are correctly formatted.
- **Visual Preview Panel**: A side-by-side split screen will render a draft preview of the form based on the currently edited JSON schema, allowing the admin to inspect the look and feel instantly before saving.
- **Future Roadmap**: The database structure will store form definition schemas as standard JSONB, which allows us to upgrade to a Google Form-like drag-and-drop builder in the future without changing the underlying storage mechanism.
