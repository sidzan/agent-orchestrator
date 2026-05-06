<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# API to Feature Checklist

Complete checklist for turning an OData endpoint into a full admin feature.

## Step-by-Step

- [ ] **1. `packages/ui/config/Resources.ts`** — Add new enum key before any other step
  ```typescript
  WIDGETS = 'widgets',
  ```

- [ ] **2. Domain type** — `packages/ui/domain/<feature>/<Feature>.ts`
  - Include `id: string`, `operationCountry: string` (REQUIRED), all fields camelCased
  - Nullable backend types → `T | null`; `Guid` → `string`; `DateTime` → `string`; navigation properties → optional (`entity?: Type`)

- [ ] **3. Service file** — `apps/<APP>/src/pages/<feature>/services/<feature>Service.ts`
  - Only needed for custom REST calls beyond standard OData CRUD

- [ ] **4. Register in data provider** — `apps/<APP>/src/services/data/useDataProvider.ts`
  - Add to `AdminDataProvider` interface + wire into `updatedProvider` object

- [ ] **5. Resource file** — `apps/<APP>/src/resources/<feature>.tsx`
  ```typescript
  export const widgets: ResourceProps = {
    name: Resources.WIDGETS,
    list: <WidgetList />,
    show: <WidgetDetails />,
    options: { label: 'resources.widgets.name', group: NAVBAR_GROUPS.MANAGEMENT },
  };
  ```

- [ ] **6. Register in `apps/<APP>/src/admin.tsx`** — `<Resource {...widgets} />`

- [ ] **7. Feature directory structure**
  ```
  apps/<APP>/src/pages/<feature>/
  ├── config.ts              # FIXED_COLUMNS, OPTIONAL_COLUMNS, constants
  ├── list/
  │   └── ui/
  │       ├── <Feature>List.tsx
  │       └── <Feature>List.test.tsx
  ├── details/
  │   └── ui/
  │       ├── <Feature>Details.tsx
  │       └── general/<Feature>General.tsx
  └── create/
      └── ui/
          └── <Feature>Create.tsx
  ```

- [ ] **8. Translation keys** — Add to Lokalise (run `pnpm --filter=@yourorg/<APP> lokalise`)
  - `resources.<feature>.name` — display name (plural)
  - `resources.<feature>.fields.<fieldName>` — column/input labels

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
