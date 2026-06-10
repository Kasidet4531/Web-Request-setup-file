# 9. Auto-fill Resolution Strategy for Duplicate Historical Matches

We decided that when an auto-fill lookup maps to multiple historical completed requests, the system will resolve the conflict by retrieving values from the most recently completed request, rather than showing a picker interface or failing the lookup.

## Context

Administrators configure auto-fill rules where entering a value in a trigger field (e.g., Reference PSF Name) automatically populates other target fields (e.g., Probecard Name, Product) based on historical records. However, because products and probe cards can evolve or be reconfigured over time, multiple historical requests might share the same trigger value but contain different target values. We need a deterministic, low-friction mechanism to decide which request's data to use.

## Decision

We chose the Most Recent Completed Match resolution strategy:
- **Query Resolution**: The `AutofillService` will query completed requests matching the trigger canonical value, ordered by their completion timestamp (`completed_at DESC`), and retrieve target values from the first result (the most recently completed request).
- **User Agency**: The auto-filled fields remain fully editable by the user. If the most recent historical record is not the desired match for the current request, the user can manually overwrite the fields.
- **Visual Notification**: When fields are auto-filled, the UI will display a badge indicating they were auto-filled, and a tooltip or status line will specify the source request number (e.g., *"Auto-filled from REQ-0004 (latest completed)"*).
- **Benefits**:
  - **Ease of Implementation**: Avoids building complex selection modals or multi-step picker UI components on the requester's form page.
  - **Relevance**: In physical engineering processes, the most recent completed setup is statistically the most accurate representation of current configuration states.
