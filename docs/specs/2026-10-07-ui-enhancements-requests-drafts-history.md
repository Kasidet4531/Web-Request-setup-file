# Specification: UI Enhancements for Requests, Drafts, Audit History, and Autofill Rules

## Problem Statement

Users and administrators experience several usability friction points and layout inconsistencies across the PSF Request Management portal:
1. In the **Requests** list (`/requests`), the Product Type filter takes up space while being rarely filtered directly alongside keyword and status, and the Status filter is awkwardly sandwiched rather than positioned naturally on the right.
2. In **My Drafts** (`/my-drafts`), having multiple cramped search inputs is unnecessary when a simple keyword filter would provide faster access to drafts.
3. In **Draft Detail**, the "Submit request" section is pushed to the bottom of the page (unlike submitted requests where action controls are prominently placed at the top). Furthermore, the "Delete Draft" button is isolated at the top rather than near the primary "Save draft changes" action, and obsolete explanatory helper text ("Requester information is saved separately from PSF information.") clutters the bottom of the form when the card header already clearly shows status indicators.
4. In **Admin Draft Management**, admins must explicitly click a "Search Drafts" button rather than experiencing instant live search, the Product Type search filter adds visual clutter, and inspecting a draft requires targeting a tiny "Inspect" link in the actions column rather than clicking anywhere on the draft's row.
5. In **Admin Draft Detail**, viewing a draft presents a bare, non-standard layout lacking the familiar header metadata, structured tabs, and presentation found in standard request detail views.
6. In **Audit History**, system-wide audit records and permanent draft deletion logs are currently separated in different areas of the application, forcing administrators to navigate to different tools to review permanent lifecycle deletions.
7. In the **Autofill Rules** modal editor, the left column displays redundant borders and card backgrounds ("nested boxes within a box") leftover from previous inline page layouts.
8. Across data tables throughout the application, the "Action" / "Actions" column header text is visually repetitive and clutters the table header row.

## Solution

1. **Streamline Request Filters**:
   - In `/requests`, remove the Product Type filter. Expand the Keyword input across the left side and place the Status dropdown selector on the right alongside the Clear Filters action.
   - In `/my-drafts`, provide a single full-width Keyword search input with the Clear Filters button.
2. **Standardize Draft Detail Actions**:
   - Move the "Submit request" card to the top of the detail layout, directly matching the placement of "Change Status" on submitted requests.
   - Relocate the "Delete Draft" button to the bottom action row, immediately to the left of the "Save draft changes" button.
   - Remove the obsolete explanatory sentence ("Requester information is saved separately from PSF information.") and redundant bottom status text, allowing the action buttons to sit cleanly in the form footer.
3. **Enhance Draft Management Usability**:
   - Upgrade Draft Management search inputs (Keyword and Creator) to automatically filter with debounced live search (~300ms) and remove the explicit "Search Drafts" button.
   - Remove the Product Type search input.
   - Make entire table rows interactive and clickable, navigating directly to the Draft Detail view. Remove the redundant "Inspect" link while retaining the "Delete" action button in the rightmost column.
4. **Consolidate Audit History & Draft Deletions**:
   - Remove the "Draft deletion log" section from Draft Management.
   - Introduce a tabbed interface in Audit History (`/history`) with two tabs: **System Audit Trail** and **Draft Deletions** (visible to administrators, with pagination).
5. **Harmonize Admin Draft Detail Layout**:
   - Reconstruct the Admin Draft Detail view to use the standard request detail layout: header summary metadata (Priority, Due Date, Requester, Status), standard tabs (Requester Information, PSF Created Information), and consistent card framing while maintaining read-only permissions and Admin Delete capability.
6. **Clean Autofill Rule Modal Styling**:
   - Eliminate redundant border and background styles from the trigger column inside the Autofill Rule dialog, ensuring a seamless single-card appearance.
7. **Visually Hide Table Action Headers**:
   - Across all data tables, visually hide the "Action" / "Actions" header text while preserving screen-reader accessibility using `.sr-only` markup.

## User Stories

1. As a requester browsing `/requests`, I want the Keyword filter to be wider and the Status filter positioned on the right next to Clear Filters, so that I can quickly scan and filter requests without cluttered unused fields.
2. As a requester browsing `/my-drafts`, I want a single prominent Keyword search box, so that I can quickly find my drafts without confusing extraneous inputs.
3. As a requester editing a saved Draft, I want the "Submit request" section placed prominently at the top of the page, so that submitting my draft follows the exact same workflow pattern as changing status on submitted requests.
4. As a requester editing a saved Draft, I want the "Delete Draft" button located at the bottom next to "Save draft changes", so that all draft lifecycle and save controls are grouped together where I finish editing.
5. As a requester editing a saved Draft, I want obsolete helper text removed from the bottom of the form, so that the form footer is compact and clean.
6. As an administrator in Draft Management, I want draft search to update automatically as I type, so that I don't have to repeatedly press an extra search button.
7. As an administrator in Draft Management, I want to click anywhere on a draft's table row to view its details, so that navigation is faster and more ergonomic than aiming for a small text link.
8. As an administrator in Draft Management, I want the table action column to only show the Delete button, so that the row actions are focused without redundant inspect links.
9. As an administrator in Draft Management, I want the Product Type filter removed, so that the search bar contains only relevant filters.
10. As an administrator, I want to review permanent draft deletion logs within the central Audit History page under a dedicated tab, so that all compliance, auditing, and deletion logs are accessible in one place.
11. As a non-administrator viewing Audit History, I want the draft deletion tab hidden from my view, so that administrative deletion logs remain restricted to authorized roles.
12. As an administrator inspecting a draft in Draft Management, I want the detail page to display the standard request header summary and tabs, so that I have the same comprehensive viewing experience as a normal request.
13. As an administrator creating or editing an Autofill Rule, I want the left trigger column in the modal dialog to have a seamless appearance without nested border boxes, so that the dialog looks visually balanced and professional.
14. As a user viewing data tables across the application, I want the "Action" column headers to be visually clean without redundant text labels, so that table headers look modern and uncluttered.
15. As a user relying on assistive technology or screen readers, I want table action columns to retain accessible labels even when visually hidden, so that I can easily identify the purpose of the column.

## Implementation Decisions

- **Requests Workspace Filtering**:
  - The request filter form layout switches from a three-column input grid to a two-column layout (`minmax(220px, 1fr) minmax(180px, 240px)`) for Keyword and Status.
  - The drafts workspace filter form switches to a single full-width column layout for Keyword.
  - Query state removes `productType` state tracking and prevents sending empty product type query parameters.
- **Draft Detail Layout & Actions**:
  - Remove flex ordering overrides (`order: 2`) from the draft detail actions sidebar so that the status workflow panel sits naturally at the top on both drafts and submitted requests.
  - Update the dynamic form renderer and active schema form footer to support a primary action alongside an optional leading destructive action ("Delete Draft").
  - Remove the separate top-level Delete Draft button from the detail shell; delegate deletion triggering to the footer button.
  - Remove the paragraph explaining separate PSF save behavior and remove the bottom edit state indicator.
- **Admin Draft Management**:
  - Implement debounced live input handling on keyword and creator filters with automatic pagination reset.
  - Render table rows with interactive row styling, accessible enter/space key handling, and click delegation to navigate to the draft detail route.
  - Retain the Delete button in the action column with `stopPropagation` to prevent inadvertent row navigation.
  - Remove the Deletion Log section from this page.
- **Audit History Tabs**:
  - Introduce tab controls on the Audit History page: "System Audit Trail" (default) and "Draft Deletions".
  - Only show the "Draft Deletions" tab when the authenticated user possesses the `admin` role.
  - Move the draft deletion table, state management, and pagination logic into the Draft Deletions tab view.
- **Admin Draft Detail Layout**:
  - Refactor the Admin Draft Detail page to render the `RequestHeaderSummary` component with complete metadata (Priority, Due Date, Creator, Product Type).
  - Structure the main content into standard tabs ("Requester Information", "PSF Created Information" when visible) rendering read-only schema views.
  - Embed the Admin Delete Draft button in the standard action sidebar.
- **Autofill Dialog Styling**:
  - Reset `border` and `background` on the source trigger column selector inside the modal dialog context to inherit transparent backgrounds and zero borders.
- **Accessible Table Action Headers**:
  - Update all table templates (`RequestsTable`, `AdminDraftTable`, `AdminAutofillRulesTable`, `AdminUserManagementTable`, `AdminWorkflowTransitionTable`, `AdminFormConfigTable`) to render `<th scope="col"><span className="sr-only">Actions</span></th>`.

## Testing Decisions

- **Testing Principles**:
  - Tests must verify external user-facing behavior through the highest available integration seam.
  - No testing of internal component states, private variables, or CSS class presence in isolation; test by querying accessible roles, labels, button texts, user events, and navigation assertions.
- **Primary Testing Seam**:
  - **Component Integration Tests (`@testing-library/react` & Vitest)**:
    - `RequestsWorkspace.test.tsx`: Verify filter layout changes (Keyword and Status present, Product Type absent), submit action placed in document order above the form, and Delete Draft button rendered at the bottom left of Save Draft changes.
    - `AdminDraftManagementPage.test.tsx`: Verify typing in keyword/creator triggers debounced searches without a search button, clicking a row navigates to the draft detail route, clicking Delete triggers the delete dialog without navigating, and Deletion Log is no longer rendered on this page.
    - `GlobalHistoryPage.test.tsx`: Verify tab switching between System Audit Trail and Draft Deletions for admin users, and verify pagination and deletion records in the deletions tab.
    - `AdminAutofillRulesPage.test.tsx`: Verify modal dialog rendering and table header accessibility.
- **Prior Art**:
  - Existing comprehensive integration tests in `frontend/src/components/*.test.tsx` utilizing `@testing-library/react` and mock API fixtures.

## Out of Scope

- Backend database schema migrations (existing endpoints and database tables are sufficient).
- Changing backend draft reminder intervals or notification logic.
- Modifying role permissions (non-admins remain unable to view administrative draft management or draft deletions).
- Modifying PSF request workflow transition state machines.

## Further Notes

- All changes maintain strict WCAG accessibility guidelines, ensuring that visually hidden action headers remain detectable by screen readers and clickable table rows remain keyboard accessible via `Enter` and `Space`.
- All domain vocabulary aligns with the project's [GLOSSARY.md](file:///c:/Users/nxg22301/Anti_Web/Unified-local-auth/GLOSSARY.md).
