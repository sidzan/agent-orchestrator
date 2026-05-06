/**
 * Template: Custom REST API service (use only for non-OData endpoints)
 * Copy to: apps/<APP>/src/pages/<featureName>/services/<featureName>Api.ts
 * Replace: <FeatureName>, <featureName>, <ApiPath>, <Feature>
 * THEN: register in apps/<APP>/src/services/data/useDataProvider.ts
 */
import type { <Feature> } from '../domain/<featureName>Domain';

type HeadersFactory = () => Promise<HeadersInit>;

export const <featureName>Api =
  (baseURL: string, getHeaders: HeadersFactory) =>
  async (param: string): Promise<<Feature>[]> => {
    const response = await fetch(`${baseURL}<ApiPath>/${param}`, {
      method: 'GET',
      headers: await getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Request failed');
    }

    return response.json();
  };
