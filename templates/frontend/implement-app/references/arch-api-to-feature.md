<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# API to Feature Checklist

Complete checklist for turning a backend endpoint into a full admin feature.

## Step-by-Step

<!-- DISCOVER:api-to-feature-checklist
  Find: in this codebase, what are the concrete steps an engineer follows
  to take a new backend endpoint and surface it as an admin/CRUD feature
  in the UI. Look for: where domain types live, where services/data
  providers are wired, where resources are registered, the directory
  shape under each feature folder, and any translation/i18n step.

  Output: a numbered checklist (markdown checkboxes) of 5–10 steps with
  concrete file paths from THIS codebase. Each step should mention the
  exact file or directory pattern an engineer should create or edit.
  Where a code snippet helps clarify the step, include a short fenced
  block. Do NOT include patterns from libraries the codebase does not
  actually import (e.g., react-admin if not present).
-->
- [ ] **1. Domain type** — wherever this codebase keeps domain models
- [ ] **2. Service file** — wherever this codebase keeps API/service wrappers
- [ ] **3. Register in data provider / API layer** — the codebase's existing data-fetching wiring
- [ ] **4. Resource / route registration** — where the new feature is exposed as a route or registered in any admin/router config
- [ ] **5. Feature directory** — follow whatever per-feature folder shape this codebase uses
- [ ] **6. Translations / i18n** — if the codebase uses an i18n library, add keys there
<!-- /DISCOVER -->

## Field Type Mapping

| Backend Type | TypeScript | List Column | Form Input |
|---|---|---|---|
| `string` | `string` | `<TextField />` | `<TextInput />` |
| `int` / `Guid` | `number` / `string` | `<NumberField />` | `<NumberInput />` |
| `DateTime` | `string` | `<DateFieldUTC />` | `<DateInputUTC />` |
| `bool` | `boolean` | `<BooleanChip />` | `<BooleanInputCustom />` |
| FK + nav | `string \| null` + `entity?` | `<ReferenceField />` | `<ReferenceInput />` |

## Rules

1. MUST add to `Resources.ts` BEFORE creating resource file
2. MUST include `operationCountry: string` in every domain type
3. MUST use `ListPageContainer` — it auto-injects `operationCountry_eq`
4. MUST use `_eq` suffix for all filter fields
5. MUST use camelCase for TypeScript properties regardless of backend casing
