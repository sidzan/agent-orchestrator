<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# OData Filters — Reference

## Import

```typescript
import { getActiveCountryCode } from '@yourorg/shared/domain';
```

## HARD RULES

- ALWAYS use `_eq` suffix for exact match filters — bare keys do not filter
- ALWAYS include `operationCountry_eq: getActiveCountryCode()` in ALL manual dataProvider calls — omitting it returns 403 Forbidden
- ALWAYS include `operationCountry: getActiveCountryCode()` in `dataProvider.update()` data payload — omitting it returns 403 Forbidden
- NEVER put `operationCountry_eq` inside `custom_filters_eq` string (quote escaping issues)
- `ListPageContainer` auto-injects `operationCountry_eq` — no manual filter needed in list pages

## Filter Suffixes

| Suffix | OData op | Example |
|--------|----------|---------|
| `_eq` | `eq` | `status_eq: 1` |
| `_contains` | `contains()` | `name_contains: 'test'` |
| `_gt` | `gt` | `amount_gt: 100` |
| `_gte` | `ge` | `fromDate_gte: '2024-01-01'` |
| `_lt` | `lt` | `toDate_lt: '2024-12-31'` |
| `_lte` | `le` | `amount_lte: 500` |
| `_inc_any` | `in ()` | `id_inc_any: [1, 2, 3]` |

## getList — Correct vs Wrong

```typescript
// ✅ CORRECT
const { data } = await dataProvider.getList('stores', {
  filter: {
    operationCountry_eq: getActiveCountryCode(),
    storeName_eq: 'My Store',
  },
});

// ❌ WRONG — missing operationCountry_eq → 403 Forbidden
const { data } = await dataProvider.getList('stores', {
  filter: { storeName_eq: 'My Store' },
});

// ❌ WRONG — missing _eq suffix → no filtering
const { data } = await dataProvider.getList('stores', {
  filter: { operationCountry_eq: getActiveCountryCode(), storeName: 'My Store' },
});
```

## update() — operationCountry in Payload

```typescript
// ✅ CORRECT
await dataProvider.update('StoreActivityBudgets', {
  id: recordId,
  data: { budgetUnits: 100, operationCountry: getActiveCountryCode() },
  previousData: record,
});

// ❌ WRONG — 403 Forbidden
await dataProvider.update('StoreActivityBudgets', {
  id: recordId,
  data: { budgetUnits: 100 },
  previousData: record,
});
```

Note: `RowForm` from `@react-admin/ra-editable-datagrid` sends the full record (includes `operationCountry`). Direct `dataProvider.update()` calls must include it manually.

## Bulk Lookup — custom_filters_eq

```typescript
const ids = [123, 456, 789];
const orConditions = ids.map((id) => `(AssignmentID eq ${id})`).join(' or ');

const { data } = await dataProvider.getList('assignments', {
  filter: {
    custom_filters_eq: `( ${orConditions} ) eq true`,
    operationCountry_eq: getActiveCountryCode(), // separate key — NOT inside the string
  },
});
```

## ReferenceInput — Inactive Filter

```typescript
const operationCountry = getActiveCountryCode();

<ReferenceInput
  source="storeId"
  reference="stores"
  filter={{ isActive_eq: true, operationCountry_eq: operationCountry }}
/>
```
