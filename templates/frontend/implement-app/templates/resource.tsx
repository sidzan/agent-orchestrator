/**
 * Template: React-admin resource registration
 * 1. Copy to: apps/<APP>/src/admin/resources/<FeatureName>Resource.tsx
 * 2. Add to admin.tsx (see comment below)
 * Replace: <FeatureName>, <featureName>, <ResourceName>
 */
import { Resource } from 'react-admin';
import { Resources } from '@yourorg/shared/config/Resources';

import { <FeatureName>List } from '@/pages/<featureName>/list/ui/<FeatureName>List';
import { <FeatureName>Details } from '@/pages/<featureName>/details/ui/<FeatureName>Details';
import { <FeatureName>Create } from '@/pages/<featureName>/create/ui/<FeatureName>Create';

export const <FeatureName>Resource = (
  <Resource
    name={Resources.<ResourceName>}
    list={<FeatureName>List}
    show={<FeatureName>Details}
    create={<FeatureName>Create}
  />
);

/**
 * In apps/<APP>/src/admin/admin.tsx, add inside <Admin>:
 *   {<FeatureName>Resource}
 */
