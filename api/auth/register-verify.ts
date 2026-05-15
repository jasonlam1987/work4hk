import { findUserByEmail, json, tokenErrorMessage, verifyAuthFlow } from './_auth_common.js';

export { config } from './_auth_common.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' });
  const token = String(req?.query?.token || '').trim();

  try {
    const verified = await verifyAuthFlow('register', token);
    if (!verified.ok) return json(res, 400, { error: verified.reason, detail: tokenErrorMessage(verified.reason) });
    const existing = await findUserByEmail(verified.record.email, req).catch(() => null);
    if (existing) return json(res, 409, { error: 'EMAIL_ALREADY_REGISTERED', detail: '此郵箱已完成註冊。' });
    return json(res, 200, {
      ok: true,
      email: verified.record.email,
      expiresAt: verified.record.expires_at,
    });
  } catch (e: any) {
    return json(res, 500, { error: 'REGISTER_VERIFY_FAILED', detail: String(e?.message || e) });
  }
}
