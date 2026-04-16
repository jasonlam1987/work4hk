import { describe, expect, it } from 'vitest';
import { createOneTimeToken, verifyOneTimeToken } from './_file_store';

describe('file store token', () => {
  it('creates and verifies one-time token', () => {
    const uid = 'abc-uid';
    const token = createOneTimeToken(uid);
    const first = verifyOneTimeToken(uid, token, {});
    expect(first.ok).toBe(true);
    const second = verifyOneTimeToken(uid, token, { [token]: new Date().toISOString() });
    expect(second.ok).toBe(false);
  });

  it('rejects wrong uid token', () => {
    const token = createOneTimeToken('uid-1');
    const result = verifyOneTimeToken('uid-2', token, {});
    expect(result.ok).toBe(false);
  });
});
