/**
 * Template: Service test
 * Copy to: apps/<APP>/src/pages/<featureName>/services/<featureName>Api.test.ts
 * Replace: <featureName>, <Feature>
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { <featureName>Api } from './<featureName>Api';

const BASE_URL = 'https://api.example.com';
const mockHeaders = vi.fn().mockResolvedValue({ Authorization: 'Bearer token' });

describe('<featureName>Api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fetches data successfully', async () => {
    // Arrange
    const mockResponse = [{ id: '1', name: 'Item' }];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    // Act
    const api = <featureName>Api(BASE_URL, mockHeaders);
    const result = await api('param-value');

    // Assert
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('param-value'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('throws error on failed response', async () => {
    // Arrange
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue('Not Found'),
    });

    // Act + Assert
    const api = <featureName>Api(BASE_URL, mockHeaders);
    await expect(api('bad-param')).rejects.toThrow('Not Found');
  });

  it('passes correct headers', async () => {
    // Arrange
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });

    // Act
    const api = <featureName>Api(BASE_URL, mockHeaders);
    await api('param');

    // Assert
    expect(mockHeaders).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    );
  });
});
