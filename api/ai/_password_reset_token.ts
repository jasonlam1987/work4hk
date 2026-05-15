import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const base64Url = (buf: Buffer) =>
  buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const fromBase64Url = (s: string) => {
  const raw = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4));
  return Buffer.from(`${raw}${pad}`, 'base64');
};

const getSecret = () => String(process.env.PASSWORD_RESET_SECRET || 'work4hk-password-reset-secret').trim();

export type PasswordResetTokenPayload = {
  jti: string;
  exp_ms: number;
  username: string;
};

export const createPasswordResetToken = (input: { username: string; ttlSec?: number }) => {
  const secret = getSecret();
  const jti = randomUUID().replace(/-/g, '');
  const ttlSec = Math.max(60, Number(input.ttlSec ?? Number(process.env.PASSWORD_RESET_TTL_SEC || 3600)));
  const expMs = Date.now() + ttlSec * 1000;
  const username = String(input.username || '').trim().toLowerCase();
  const payload = `${jti}.${expMs}.${username}`;
  const sig = base64Url(createHmac('sha256', secret).update(payload).digest());
  return {
    token: `${payload}.${sig}`,
    payload: { jti, exp_ms: expMs, username } as PasswordResetTokenPayload,
  };
};

export const verifyPasswordResetToken = (tokenRaw: string) => {
  const secret = getSecret();
  const token = String(tokenRaw || '').trim();
  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false as const, reason: 'MALFORMED' as const };
  const [jti, expMsRaw, username, sig] = parts;
  const expMs = Number(expMsRaw);
  if (!jti || !username || !sig || !Number.isFinite(expMs)) return { ok: false as const, reason: 'MALFORMED' as const };
  if (Date.now() > expMs) return { ok: false as const, reason: 'EXPIRED' as const };
  const payload = `${jti}.${expMs}.${String(username || '').trim().toLowerCase()}`;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let incoming: Buffer;
  try {
    incoming = fromBase64Url(sig);
  } catch {
    return { ok: false as const, reason: 'MALFORMED' as const };
  }
  if (incoming.length !== expected.length) return { ok: false as const, reason: 'BAD_SIG' as const };
  if (!timingSafeEqual(incoming, expected)) return { ok: false as const, reason: 'BAD_SIG' as const };
  return {
    ok: true as const,
    payload: { jti, exp_ms: expMs, username: String(username || '').trim().toLowerCase() } as PasswordResetTokenPayload,
  };
};

