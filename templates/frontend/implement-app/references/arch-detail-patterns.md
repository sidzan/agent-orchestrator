<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# Detail Patterns Reference

## HARD RULES
- MUST use `DetailsPageWithTabs` — NEVER build custom tab logic
- Tab icons MUST use Iconify strings (e.g. `'solar:user-id-bold'`)
- Edit tabs MUST use `EditBase` with `mutationMode="pessimistic"`, `actions={false}`, `redirect={false}`
- Edit forms MUST use `<AutoSave />` toolbar; create forms/dialogs use `<CreateWithCancelToolbar />`
- Create forms MUST set `defaultValues` with `operationCountry` and `status: Status.ACTIVE`
- Nested list tabs MUST set `mainPage={false}` on `ListPageContainer`

## DetailsPageWithTabs

**Import:** `@/components/DetailsPage`

```ts
interface TabConfig {
  id: string;
  value?: string;
  label: string;
  icon: string | ReactElement;  // Iconify string preferred
  component: ReactNode;
}
```

| Prop | Type | Purpose |
|------|------|---------|
| `resource` | Resources | OData resource name |
| `tabs` | TabConfig[] | Tab definitions |
| `renderTitle` | ReactNode | Title (usually WithRecord) |
| `tabsPathsObject` | Record<string, string> | URL path mapping |

## Full Detail Page Setup

```tsx
const TABS_PATHS = {
  GENERAL: '',
  ITEMS: 'items',
} as const;

export const FeatureDetails = () => {
  const t = useTranslate();
  const tabs = [
    {
      id: TABS_PATHS.GENERAL,
      value: TABS_PATHS.GENERAL,
      label: t('feature.tabs.general'),
      icon: 'solar:user-id-bold',
      component: <FeatureGeneral />,
    },
    {
      id: TABS_PATHS.ITEMS,
      value: TABS_PATHS.ITEMS,
      label: t('feature.tabs.items'),
      icon: 'rivet-icons:circle',
      component: <FeatureItemsList />,
    },
  ];
  return (
    <DetailsPageWithTabs
      resource={Resources.FEATURE_NAME}
      tabs={tabs}
      tabsPathsObject={TABS_PATHS}
      renderTitle={<WithRecord render={({ name }: { name: string }) => name} />}
    />
  );
};
```

## Edit Tab with AutoSave

```tsx
export const FeatureGeneral = () => {
  const { record } = useShowContext<Feature>();
  if (!record) return null;
  return (
    <EditBase resource={Resources.FEATURE_NAME} mutationMode="pessimistic" actions={false} redirect={false}>
      <SimpleForm toolbar={<AutoSave />} sx={{ p: 0, '.MuiCard-root': { p: 3 }, width: '100%' }}>
        <Grid container spacing={2} sx={{ width: '100%' }}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <Stack rowGap={0.75}>
                <TextInput source="name" validate={[required(), maxLength(255)]} />
                <ReferenceInput source="typeId" reference={Resources.TYPES}>
                  <AutocompleteInput optionText="typeName" fullWidth />
                </ReferenceInput>
              </Stack>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card><BooleanInputCustom source="active" /></Card>
          </Grid>
        </Grid>
      </SimpleForm>
    </EditBase>
  );
};
```

## Create Form

```tsx
export const FeatureForm: React.FC<Omit<SimpleFormProps, 'children'>> = (props) => {
  const countryCode = getActiveCountryCode();
  return (
    <SimpleForm
      mode="onChange"
      resource={Resources.FEATURE_NAME}
      toolbar={<CreateWithCancelToolbar />}
      defaultValues={{ status: Status.ACTIVE, operationCountry: countryCode }}
      {...props}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2, rowGap: 0.75 }}>
        <TextInput source="name" validate={[required(), maxLength(255)]} />
        <SelectInput source="typeId" choices={types} />
      </Box>
      <FormError />
    </SimpleForm>
  );
};
```

## Toolbars

| Toolbar | Use Case | Import |
|---------|----------|--------|
| `<AutoSave />` | Edit tabs (auto-save on change) | `@yourorg/shared/components/admin/components` |
| `<CreateWithCancelToolbar />` | Create forms & dialogs | `@yourorg/shared/components/admin/components` |

## Nested List Tab

```tsx
export const FeatureItemsList = () => {
  const { record } = useShowContext();
  return (
    <ListPageContainer resource={Resources.ITEMS} mainPage={false} empty={false}
      filter={{ parentId_eq: record.id }}
      actions={<TopToolbar><CreateInDialogButton title={t('actions.add')}><ItemForm /></CreateInDialogButton></TopToolbar>}
    >
      <Datagrid size="medium" bulkActionButtons={false}>
        <TextField source="name" />
      </Datagrid>
    </ListPageContainer>
  );
};
```
