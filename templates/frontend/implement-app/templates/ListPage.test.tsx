/**
 * Template: List page test
 * Copy to: apps/<APP>/src/pages/<featureName>/list/ui/<FeatureName>List.test.tsx
 * Replace: <FeatureName>, <featureName>, <ResourceName>
 */
import { screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { renderWithCoreAdminProviders } from '@yourorg/shared/helpers/test';
import { createUseGetListResult } from '@yourorg/shared/helpers/test';
import { <FeatureName>List } from './<FeatureName>List';

// Mock react-admin data hooks
vi.mock('react-admin', async () => {
  const actual = await vi.importActual('react-admin');
  return {
    ...actual,
    useListContext: vi.fn(),
    useGetList: vi.fn(),
  };
});

describe('<FeatureName>List', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the list page', async () => {
    // Arrange
    const { useGetList } = await import('react-admin');
    vi.mocked(useGetList).mockReturnValue(createUseGetListResult([]));

    // Act
    renderWithCoreAdminProviders(<<FeatureName>List />);

    // Assert
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('renders rows when data is present', async () => {
    // Arrange
    const mockData = [{ id: '1', name: 'Test Item' }];
    const { useGetList } = await import('react-admin');
    vi.mocked(useGetList).mockReturnValue(createUseGetListResult(mockData));

    // Act
    renderWithCoreAdminProviders(<<FeatureName>List />);

    // Assert
    expect(screen.getByText('Test Item')).toBeInTheDocument();
  });
});
