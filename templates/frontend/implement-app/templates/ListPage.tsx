/**
 * Template: Standard Admin List Page
 * Copy to: apps/<APP>/src/pages/<featureName>/list/ui/<FeatureName>List.tsx
 * Replace: <FeatureName>, <featureName>, <ResourceName>, <TranslationKey>
 */
import { useTranslate } from 'react-admin';

import { ListPageContainer } from '@yourorg/shared/layouts';
import {
  DatagridConfigurable,
  TextField,
  DateFieldUTC,
  TopToolbar,
  CreateButton,
  ExportButton,
  EditColumnsButton,
} from '@yourorg/shared/components/admin/components';
import { CanAccess } from '@yourorg/shared/components/CanAccess';

import { FIXED_COLUMNS, OPTIONAL_COLUMNS } from '../config';
import { Resources } from '@yourorg/shared/config/Resources';

// REPLACE: import your feature-specific components here
import { <FeatureName>ActionMenu } from './<FeatureName>ActionMenu';
import { <FeatureName>Filters } from './<FeatureName>Filters';

export const <FeatureName>List = () => {
  const t = useTranslate();

  return (
    <ListPageContainer
      resource={Resources.<ResourceName>}
      titleKey="<TranslationKey>.name"
      sort={{ field: 'lastModified', order: 'DESC' }}
      filters={[
        // ADD: SearchInput, SelectInput, DateInput as needed
      ]}
      actions={
        <TopToolbar>
          <CanAccess resource={Resources.<ResourceName>} action="create">
            <CreateButton />
          </CanAccess>
          <EditColumnsButton fixedColumns={FIXED_COLUMNS} />
          <ExportButton />
        </TopToolbar>
      }
    >
      <DatagridConfigurable size="medium" omit={OPTIONAL_COLUMNS} bulkActionButtons={false}>
        {/* ADD: TextField, DateFieldUTC, ReferenceField columns */}
        <TextField source="name" />
        {/* ADD: action column last */}
        {/* <WrapperField label="actions"><FeatureActionMenu /></WrapperField> */}
      </DatagridConfigurable>
    </ListPageContainer>
  );
};
