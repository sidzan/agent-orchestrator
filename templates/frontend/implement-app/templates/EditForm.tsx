/**
 * Template: Edit Form (for use inside a detail page tab)
 * Copy to: apps/<APP>/src/pages/<featureName>/details/ui/<FeatureName>General.tsx
 * Replace: <FeatureName>, <featureName>, <ResourceName>, <Feature> (domain type)
 */
import { useShowContext, EditBase, SimpleForm, TextInput, useTranslate } from 'react-admin';

import { FormError } from '@yourorg/shared/components/admin/FormError';
import { Resources } from '@yourorg/shared/config/Resources';
import { getActiveCountryCode } from '@yourorg/shared/domain';
import type { <Feature> } from '../domain/<featureName>Domain';

export const <FeatureName>General = () => {
  const { record } = useShowContext<<Feature>>();
  if (!record) return null;

  return (
    <EditBase
      resource={Resources.<ResourceName>}
      mutationMode="pessimistic"
      transform={(data) => ({
        ...data,
        operationCountry: getActiveCountryCode(), // REQUIRED — prevents 403
      })}
    >
      <SimpleForm>
        <FormError />
        {/* ADD: form fields */}
        <TextInput source="<fieldName>" fullWidth />
      </SimpleForm>
    </EditBase>
  );
};
