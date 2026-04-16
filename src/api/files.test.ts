import { describe, expect, it } from 'vitest';
import { normalizeDownloadUrl } from './files';

describe('normalizeDownloadUrl', () => {
  it('removes duplicated /api prefix for axios baseURL usage', () => {
    expect(normalizeDownloadUrl('/api/ai/files-download?uid=1&token=2')).toBe('/ai/files-download?uid=1&token=2');
  });

  it('keeps relative ai url unchanged', () => {
    expect(normalizeDownloadUrl('/ai/files-download?uid=1&token=2')).toBe('/ai/files-download?uid=1&token=2');
  });

  it('keeps absolute url unchanged', () => {
    const abs = 'http://127.0.0.1:5177/api/ai/files-download?uid=1&token=2';
    expect(normalizeDownloadUrl(abs)).toBe(abs);
  });
});
