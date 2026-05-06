/**
 * Template: Hook test
 * Copy to: apps/<APP>/src/pages/<featureName>/hooks/use<FeatureName>Data.test.ts
 * Replace: <FeatureName>, <featureName>
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { use<FeatureName>Data } from './use<FeatureName>Data';

// Mock data provider
vi.mock('@yourorg/shared/hooks/useDataProvider', () => ({
  useDataProvider: vi.fn(() => ({
    // ADD: mock custom methods if needed
    getList: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  })),
}));

vi.mock('@yourorg/shared/domain', () => ({
  getActiveCountryCode: vi.fn(() => 'NO'),
}));

describe('use<FeatureName>Data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial loading state', () => {
    // Arrange + Act
    const { result } = renderHook(() => use<FeatureName>Data({}));

    // Assert
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('returns data after fetch', async () => {
    // Arrange
    const mockData = [{ id: '1', name: 'Item' }];
    const { useDataProvider } = await import('@yourorg/shared/hooks/useDataProvider');
    vi.mocked(useDataProvider).mockReturnValue({
      getList: vi.fn().mockResolvedValue({ data: mockData, total: 1 }),
    } as any);

    // Act
    const { result } = renderHook(() => use<FeatureName>Data({}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Assert
    expect(result.current.data).toHaveLength(1);
  });

  // ADD: error handling test, filter param test
});
