<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# Form Patterns (Admin)

<!-- DISCOVER:arch-form-patterns
  Find: in this codebase, what are the conventions for the topic
  this file covers (see the title above). Look at existing
  components/files to derive: file paths, library imports,
  naming conventions, prop shapes, hard rules.

  Output: replace the body of this reference with concrete
  guidance grounded in THIS codebase. Drop any patterns from
  libraries/frameworks the codebase does not actually use.
-->

Key patterns for React Hook Form in create/edit forms.

## FormError — Server Error Display

```typescript
import { FormError } from '@yourorg/shared/components/admin/FormError';

<Form>
  <FormError />   {/* MUST be FIRST child — displays server-side errors */}
  <TextInput source="widgetName" />
</Form>
```

## defaultValues — operationCountry Required

Every create form MUST include `operationCountry` in defaultValues:

```typescript
import { getActiveCountryCode } from '@yourorg/shared/domain';

<SimpleForm defaultValues={{ operationCountry: getActiveCountryCode(), isActive: true }}>
```

## setValue — Always Pass `shouldDirty: true`

```typescript
// DO: form will submit after programmatic change
setValue('fieldName', value, { shouldDirty: true });

// DON'T: form silently skips submission — isDirty stays false
setValue('fieldName', value);
```

## Pagination-Safe Forms

When form state must survive list pagination, separate display data (paginated) from state (all selections, `perPage: 0`). Initialise the form from the complete state array, never from the current page slice. Do NOT use `useRecordContext` for form init inside paginated lists.

## Context-Driven Values

Prefer `getActiveCountryCode()` from `@yourorg/shared/domain` over any hardcoded country string.

## HARD RULES

- `<FormError />` MUST be the first child inside `<Form>` — no exceptions
- Every create form `defaultValues` MUST include `operationCountry: getActiveCountryCode()`
- `setValue` without `{ shouldDirty: true }` silently breaks form submission — always pass it
- Only user-editable values belong in React Hook Form state — lookup/reference IDs stay in source arrays
- Never rely on `useRecordContext` for form init inside paginated lists — use external state
<!-- /DISCOVER -->
