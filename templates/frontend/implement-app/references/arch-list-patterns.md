<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# List Patterns Reference

## HARD RULES
- MUST use `ListPageContainer` + `DatagridConfigurable` for OData resources — NEVER raw MUI Table
- MUST use `DatagridConfigurable`, NEVER plain `Datagrid` for main OData lists
- `ListPageContainer` auto-injects `operationCountry_eq` — do NOT add it manually in list filters
- For custom REST API data: use `useList` + `ListContextProvider` + plain `Datagrid` (NOT `DatagridConfigurable`)
- NEVER use `Table`, `TableRow`, `TableCell`, `TableHead`, `TableBody`, `TableContainer`

## ListPageContainer

**Import:** `@yourorg/shared/layouts`

| Prop | Type | Purpose |
|------|------|---------|
| `resource` | string | OData resource name |
| `titleKey` | string | i18n key for page title |
| `filters` | ReactElement[] | Filter inputs |
| `filterDefaultValues` | object | Default filter values |
| `sort` | `{ field, order }` | Default sort |
| `actions` | ReactNode | TopToolbar buttons |
| `mainPage` | boolean | Wrap in DashboardContent (default true) |
| `queryOptions` | object | OData expand/meta |

## Canonical List Page

```tsx
export const FeatureList = () => {
  const t = useTranslate();
  return (
    <ListPageContainer
      resource={Resources.FEATURE_NAME}
      titleKey="resources.feature.name"
      filterDefaultValues={{ status_eq: Status.ACTIVE }}
      sort={{ field: 'lastModified', order: 'DESC' }}
      filters={[
        <SearchInput key="search" source="q" size="medium" alwaysOn
          placeholder={t('list.searchInput.placeholder')} />,
      ]}
      actions={
        <TopToolbar>
          <CanAccess resource={Resources.FEATURE_NAME} action="create">
            <CreateButton />
          </CanAccess>
          <FeatureFilters />
          <EditColumnsButton fixedColumns={FIXED_COLUMNS} />
          <ExportButton />
        </TopToolbar>
      }
    >
      <DatagridConfigurable size="medium" omit={OPTIONAL_COLUMNS} bulkActionButtons={false}>
        <TextField source="name" />
        <DateFieldUTC source="createdDate" emptyText="-" />
        <ReferenceField source="typeId" reference="types" link={false}>
          <TextField source="typeName" />
        </ReferenceField>
        <WrapperField label="actions"><FeatureActionMenu /></WrapperField>
      </DatagridConfigurable>
    </ListPageContainer>
  );
};
```

## Column Types

| Component | Import | Use Case |
|-----------|--------|----------|
| `TextField` | `@yourorg/shared/components/admin/components` | Simple text |
| `NumberField` | `@yourorg/shared/components/admin/components` | Numbers |
| `DateFieldUTC` | `@yourorg/shared/components/Date` | UTC dates |
| `ReferenceField` | `react-admin` | Foreign keys (use `link={false}`) |
| `FunctionField` | `react-admin` | Custom render |
| `WrapperField` | `react-admin` | Action button menus |
| `BooleanChip` | `@/components/BooleanChip` | Yes/No display |

## Column Config (config.ts)

```ts
export const FIXED_COLUMNS: (keyof Feature)[] = ['id', 'name'];
export const OPTIONAL_COLUMNS: (keyof Feature)[] = ['description', 'createdDate'];
// In toolbar: <EditColumnsButton fixedColumns={FIXED_COLUMNS} />
// In grid:    <DatagridConfigurable omit={OPTIONAL_COLUMNS}>
```

## Filter Pattern (FilterButton)

**Import:** `@/components/FilterButton`

```tsx
export const FeatureFilters = () => {
  const t = useTranslate();
  const countryCode = getActiveCountryCode();
  return (
    <FilterButton useFilterValues={useFeatureFilterValues}>
      <Box>
        <Typography variant="subtitle2">{t('filters.status')}</Typography>
        <ReferenceInput reference={Resources.STATUSES} source="statusId_eq"
          filter={{ operationCountry_eq: countryCode }}>
          <SelectInput optionText="statusName" fullWidth />
        </ReferenceInput>
      </Box>
      <Box>
        <DateInputUTC source="fromDate_gte" label={t('startDate')} slotProps={{ field: { clearable: true } }} />
        <DateInputUTC source="fromDate_lt" label={t('endDate')} slotProps={{ field: { clearable: true } }} />
      </Box>
    </FilterButton>
  );
};

// Filter hook
export const useFeatureFilterValues = () =>
  useFilters<FeatureFilters, FeatureFiltersForm>({ defaultFiltersFormValues });
```

## Custom REST API Data (not OData)

```tsx
const listContext = useList({ data: dataWithIds, isLoading, resource: 'featureName' });
return (
  <ListContextProvider value={listContext}>
    <Datagrid resource="featureName" size="medium" bulkActionButtons={false}>
      <TextField source="name" label="resources.feature.fields.name" />
    </Datagrid>
  </ListContextProvider>
);
// Each item MUST have an `id` field. Use plain Datagrid, NOT DatagridConfigurable.
```
