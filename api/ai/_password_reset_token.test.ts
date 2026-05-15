import { describe, expect, it } from 'vitest';
import { createPasswordResetToken, verifyPasswordResetToken } from './_password_reset_token';

describe('password reset token', () => {
  it('creates and verifies token', () => {
    const { token, payload } = createPasswordResetToken({ username: 'Admin', ttlSec: 3600 });
    const verified = verifyPasswordResetToken(token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.jti).toBe(payload.jti);
      expect(verified.payload.username).toBe('admin');
    }
  });

  it('rejects expired token', () => {
    const { token } = createPasswordResetToken({ username: 'admin', ttlSec: 60 });
    const parts = token.split('.');
    const expired = `${parts[0]}.${String(Date.now() - 1000)}.${parts[2]}.${parts[3]}`;
    const verified = verifyPasswordResetToken(expired);
    expect(verified.ok).toBe(false);
  });

  it('rejects tampered token', () => {
    const { token } = createPasswordResetToken({ username: 'admin', ttlSec: 3600 });
    const tampered = token.replace('.admin.', '.root.');
    const verified = verifyPasswordResetToken(tampered);
    expect(verified.ok).toBe(false);
  });
});

