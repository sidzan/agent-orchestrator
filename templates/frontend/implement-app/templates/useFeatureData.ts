/**
 * Template: Data hook
 * Copy to: apps/<APP>/src/pages/<featureName>/hooks/use<FeatureName>Data.ts
 * Replace: <FeatureName>, <featureName>, <ResourceName>, <Feature>
 */
import { useDataProvider } from '@yourorg/shared/hooks/useDataProvider';
import { getActiveCountryCode } from '@yourorg/shared/domain';
import { Resources } from '@yourorg/shared/config/Resources';
import type { AdminDataProvider } from '@/services/data/useDataProvider';
import type { <Feature> } from '../domain/<featureName>Domain';

interface Use<FeatureName>DataOptions {
  // ADD: filter params as needed
  id?: string;
}

export const use<FeatureName>Data = ({ id }: Use<FeatureName>DataOptions) => {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const operationCountry = getActiveCountryCode();

  // For OData list:
  // const { data, isLoading } = useGetList<Feature>(Resources.<ResourceName>, {
  //   filter: { operationCountry_eq: operationCountry, /* ADD filters */ },
  // });

  // For custom API:
  // const [data, setData] = useState<Feature[]>([]);
  // const [isLoading, setIsLoading] = useState(false);
  // useEffect(() => {
  //   if (!id) return;
  //   setIsLoading(true);
  //   dataProvider.<customMethod>(id)
  //     .then(setData)
  //     .finally(() => setIsLoading(false));
  // }, [id, dataProvider]);

  return {
    // ADD: return values
    data: [] as <Feature>[],
    isLoading: false,
  };
};
