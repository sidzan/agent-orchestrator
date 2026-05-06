<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# Custom API Patterns

How to add custom (non-OData) REST API calls in the admin app.

## Architecture

```
UI component
  → custom hook (useDataProvider<AdminDataProvider>())
    → AdminDataProvider interface method
      → service function (pure fetch, no React)
```

## Step-by-Step Implementation

### Step 1: Create service function

```typescript
// apps/<APP>/src/pages/<feature>/services/<feature>Service.ts
type HeadersFactory = () => Promise<HeadersInit>;

export const myFeatureApi =
  (baseURL: string, getHeaders: HeadersFactory) =>
  async (param: string): Promise<MyResponse[]> => {
    const response = await fetch(`${baseURL}/api/v1/my-endpoint/${param}`, {
      method: 'GET',
      headers: await getHeaders(),
    });
    if (!response.ok) throw new Error(await response.text() || 'Failed');
    return response.json();
  };
```

### Step 2: Add to `AdminDataProvider` interface

```typescript
// apps/<APP>/src/services/data/useDataProvider.ts
import type { MyResponse } from '@/pages/<feature>/domain/myDomain';

export interface AdminDataProvider extends DataProvider {
  // ... existing methods
  myFeatureApi: (param: string) => Promise<MyResponse[]>;
}
```

### Step 3: Wire into `updatedProvider`

```typescript
// Inside useDataProvider.ts, in the updatedProvider object:
const updatedProvider = {
  // ... existing entries
  myFeatureApi: myFeatureApi(baseURL, getHeaders),
};
```

### Step 4: Consume via hook

```typescript
// apps/<APP>/src/pages/<feature>/hooks/useMyFeatureApi.ts
import { useDataProvider } from 'react-admin';
import { useQuery } from '@tanstack/react-query';
import type { AdminDataProvider } from '@/services/data/useDataProvider';

export const useMyFeatureApi = (param: string) => {
  const dp = useDataProvider<AdminDataProvider>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-feature-api', param],
    queryFn: () => dp.myFeatureApi(param),
    enabled: false,
  });

  return { data: data ?? [], isLoading, error, trigger: refetch };
};
```

## Existing Examples (Admin App)

| Service | Location |
|---------|----------|
| `sendSMS` | `pages/employees/list/data/sendSms.ts` |
| `getOfferAverageCost` | `pages/offers/services/getOfferAverageCost.ts` |
| `getEmployeeUser` | `pages/employees/services/getEmployeeUser.ts` |
| `downloadReturnCredit` | `pages/returns-credits/list/services/downloadReturnCredit.ts` |

## HARD RULES

- NEVER import a service function directly in a hook or UI — always go through `useDataProvider<AdminDataProvider>()`
- Services MUST be pure functions — no React imports, no hooks, no side effects
- MUST add the method to the `AdminDataProvider` interface (typed)
- MUST wire the method into `updatedProvider` in `useDataProvider.ts`
- NEVER pass `baseURL` or `getHeaders` as props to pages — the data provider handles auth
