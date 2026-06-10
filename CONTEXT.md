# PSF Setup File Request Management

This context manages the request lifecycle for creating and updating PSF Setup Files, enforcing role-based visibility and dynamic form configurations.

## Language

**PSF Request**:
A request to create or update a PSF Setup File.
_Avoid_: File Request, Setup Request

**Requester**:
A user role that creates a PSF Request and provides the initial request information.
_Avoid_: Requester Role, Applicant

**Setup File Owner**:
An engineer or user responsible for reviewing a PSF Request, creating or updating the actual setup file, and entering the setup details.
_Avoid_: Engineer, Owner, Setup Owner

**PSF Created Information**:
The section of the PSF Request filled in by the Setup File Owner containing the final setup details.
_Avoid_: Setup Information, Completed Info

**Draft**:
A PSF Request that has been created but not yet submitted.
_Avoid_: In-progress request, unsaved request

