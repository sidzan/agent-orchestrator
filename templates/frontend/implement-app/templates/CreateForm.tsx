/**
 * Template: Create Form
 * Copy to: apps/<APP>/src/pages/<featureName>/create/ui/<FeatureName>Create.tsx
 * Replace: <FeatureName>, <featureName>, <ResourceName>, <FieldType>, <fieldName>
 */
import { Create, SimpleForm, TextInput, required, useTranslate } from 'react-admin';

import { FormError } from '@yourorg/shared/components/admin/FormError';
import { Resources } from '@yourorg/shared/config/Resources';
import { getActiveCountryCode } from '@yourorg/shared/domain';

// Default values MUST include operationCountry
const defaultValues = {
  operationCountry: getActiveCountryCode(),
  // ADD: other default field values here
};

export const <FeatureName>Create = () => {
  const t = useTranslate();

  return (
    <Create resource={Resources.<ResourceName>}>
      <SimpleForm defaultValues={defaultValues}>
        <FormError />
        {/* ADD: form fields — TextInput, SelectInput, ReferenceInput, etc. */}
        <TextInput source="<fieldName>" validate={[required()]} fullWidth />
      </SimpleForm>
    </Create>
  );
};
