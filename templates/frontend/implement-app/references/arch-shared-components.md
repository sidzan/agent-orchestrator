<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# Shared Components — Reference

## HARD RULES

- ALWAYS check `@yourorg/shared` and `@yourorg/minimal` before creating any new UI component
- NEVER duplicate a component that already exists in shared packages
- Raw `DatePicker` from `@mui/x-date-pickers` MUST be wrapped in `<LocalizationProvider>` — without it you get: `"MUI X: Can not find the date and time pickers localization context"`
- `FormError` MUST be the first child inside `<Form>`

## Key Shared Components

| Component | Import | When to use | Key props |
|-----------|--------|-------------|-----------|
| `ListPageContainer` | `@yourorg/shared/layouts` | Wrapper for every list page; auto-injects `operationCountry_eq` | `title`, `actions`, `filters` |
| `DetailsPageWithTabs` | `@/components/DetailsPage` | Detail page with tab navigation | `tabs`, `record` |
| `FormError` | `@yourorg/shared/components/admin/FormError` | Show server-side form errors; must be first child of `<Form>` | — |
| `DateFieldUTC` | `@yourorg/shared/components/Date` | UTC-aware date display — prefer over raw `DateField` | `source`, `showTime` |
| `DateInputUTC` | `@yourorg/shared/components/Date` | UTC-aware date input; includes `LocalizationProvider` internally | `source`, `label` |
| `LocalizationProvider` | `@mui/x-date-pickers` | Wrap raw `DatePicker` only when not using `DateInputUTC` | `dateAdapter`, `adapterLocale` |
| `renderWithCoreAdminProviders` | `@yourorg/shared/helpers/test` | Test helper — wraps component with all required admin providers | `(ui, options?)` |

## Admin Components (`@yourorg/shared/components/admin/components`)

| Component | Purpose |
|-----------|---------|
| `EditInDialogButton` | Opens edit form in a dialog |
| `CreateInDialogButton` | Opens create form in a dialog |
| `CreateWithCancelToolbar` | Save + Cancel toolbar for forms |
| `EditableDatagrid` | Inline-editable table rows |
| `SearchInput` | Search/autocomplete filter input |
| `ExportButton` | CSV export |
| `StatusChip` | Active/Inactive colored chip (`@yourorg/shared/components/admin/Status`) |

## LocalizationProvider Pattern (raw DatePicker only)

```typescript
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { getLocale } from '@yourorg/shared/helpers/date';

<LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={getLocale()}>
  <DatePicker label="Select Date" value={value} onChange={onChange} />
</LocalizationProvider>
```

Prefer `DateInputUTC` or `MonthYearPicker` from `@yourorg/shared/components/Date` — they include `LocalizationProvider` internally.

## Icons

- Use `Iconify` from `@yourorg/minimal/components/iconify` for all icons (100K+ SVG icons via Iconify CDN)
- Do NOT import icons directly from `@mui/icons-material` unless no Iconify equivalent exists
