/**
 * Template: Detail Page with Tabs
 * Copy to: apps/<APP>/src/pages/<featureName>/details/ui/<FeatureName>Details.tsx
 * Replace: <FeatureName>, <featureName>, <ResourceName>
 */
import { useTranslate } from 'react-admin';
import { WithRecord } from 'react-admin';

import { DetailsPageWithTabs } from '@/components/DetailsPage';
import { Resources } from '@yourorg/shared/config/Resources';

// REPLACE: import your tab components
import { <FeatureName>General } from './<FeatureName>General';

const TABS_PATHS = {
  GENERAL: '',
  // ADD: additional tabs as needed (e.g., ITEMS: 'items')
} as const;

export const <FeatureName>Details = () => {
  const t = useTranslate();

  const tabs = [
    {
      id: TABS_PATHS.GENERAL,
      value: TABS_PATHS.GENERAL,
      label: t('<featureName>.tabs.general'),
      icon: 'solar:user-id-bold', // REPLACE: use appropriate Iconify icon
      component: <<FeatureName>General />,
    },
    // ADD: additional tabs here
  ];

  return (
    <DetailsPageWithTabs
      resource={Resources.<ResourceName>}
      tabs={tabs}
      tabsPathsObject={TABS_PATHS}
      renderTitle={
        <WithRecord render={({ name }: { name: string }) => name} />
      }
    />
  );
};
