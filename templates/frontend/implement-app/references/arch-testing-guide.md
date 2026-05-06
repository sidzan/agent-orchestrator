<!-- EDIT-ME -->
<!--
  This is a starter pattern doc derived from a React-Admin + OData project.
  Replace with the conventions used in your codebase. The orchestrator instructs
  agents to read this file before implementing matching feature types — keep the
  contract, change the contents.
-->

# Testing Guide (Admin)

## Coverage Targets

| Mode | Per-file Coverage | Duplication |
|------|-------------------|-------------|
| Full | >= 80% | < 3% (Sonar enforces) |
| Fast | >= 70% | < 3% |

Sonar enforces these gates on every PR — no exceptions.

## Test Utilities

| Function | Import Path | When to Use |
|----------|-------------|-------------|
| `renderWithCoreAdminProviders` | `@yourorg/shared/test-helpers` | Component needs CoreAdminContext + ThemeProvider + SettingsProvider |
| `renderWithAdminContextProviders` | `@yourorg/shared/test-helpers` | Full admin context including MemoryRouter routing |
| `renderHook` | `@testing-library/react` | Testing custom hooks in isolation |
| `createUseGetListResult` | `@yourorg/shared/test-helpers` | Mocking `useGetList` return value |
| `createUseGetOneResult` | `@yourorg/shared/test-helpers` | Mocking `useGetOne` return value |

## Fixtures

Location: `packages/ui/helpers/fixtures/` — 34 fixture files covering employees, customers, stores, assignments, workdays, photos, questionnaires, products, regions, articles, travel bills, documents, and more.

```typescript
import { createEmployeeFixture } from '@yourorg/shared/helpers/fixtures/employeeFixtures';
const employee = createEmployeeFixture({ firstName: 'Test' });
```

## AAA Pattern Example

```typescript
describe('WidgetList', () => {
  it('renders widget name in table', () => {
    // Arrange
    vi.mocked(useGetList).mockReturnValue(createUseGetListResult([mockWidget]));
    // Act
    render(<WidgetList />, { wrapper: renderWithAdminContextProviders });
    // Assert
    expect(screen.getByText(mockWidget.widgetName)).toBeInTheDocument();
  });
});
```

## Scoped Test Commands

```bash
# Run tests for a specific feature (ALWAYS use this form)
pnpm test apps/<APP>/src/pages/<feature> --reporter=verbose --pool-options.threads.maxThreads=3; pkill -f "vitest" 2>/dev/null || true

# Scoped coverage for a feature
pnpm test --coverage --coverage.include='apps/<APP>/src/pages/<feature>/**' apps/<APP>/src/pages/<feature> --reporter=verbose --pool-options.threads.maxThreads=3; pkill -f "vitest" 2>/dev/null || true
```

## HARD RULES

- NEVER run `pnpm run test` or `pnpm run coverage` without a scope path — always filter to the feature under test
- MUST test services, hooks, UI components, AND pages — never skip hooks when they contain domain logic
- MUST co-locate test files: `Component.test.tsx` next to `Component.tsx`
- MUST use AAA pattern (Arrange, Act, Assert)
- MUST NOT add comments in tests unless strictly necessary
- MUST clean up: `afterEach(() => { cleanup(); vi.clearAllMocks(); })`
