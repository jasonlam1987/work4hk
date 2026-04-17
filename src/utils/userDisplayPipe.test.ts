import { describe, expect, it } from 'vitest';
import { userDisplayPipe } from './userDisplayPipe';

describe('userDisplayPipe', () => {
  it('returns salutation when set', () => {
    expect(userDisplayPipe({ salutation: 'Jason Lam', username: 'admin' })).toBe('Jason Lam');
  });

  it('returns 未設定 when salutation missing', () => {
    expect(userDisplayPipe({ username: 'admin' })).toBe('未設定');
    expect(userDisplayPipe(undefined)).toBe('未設定');
  });
});

