import {
  findUserByEmail,
  isStrongPassword,
  json,
  markAuthFlowUsed,
  readBody,
  tokenErrorMessage,
  updateUserPassword,
  verifyAuthFlow,
} from './_auth_common.js';

export { config } from './_auth_common.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  const body = await readBody(req);
  const token = String(body?.token || '').trim();
  const password = String(body?.password || '');
  const confirmPassword = String(body?.confirmPassword || '');

  if (!password || !confirmPassword) return json(res, 400, { error: 'PASSWORD_REQUIRED' });
  if (password !== confirmPassword) return json(res, 400, { error: 'PASSWORD_MISMATCH' });
  if (!isStrongPassword(password)) return json(res, 400, { error: 'WEAK_PASSWORD' });

  try {
    const verified = await verifyAuthFlow('reset', token);
    if (!verified.ok) return json(res, 400, { error: verified.reason, detail: tokenErrorMessage(verified.reason) });

    const existing = await findUserByEmail(verified.record.email, req).catch(() => null);
    if (!existing?.id) return json(res, 404, { error: 'USER_NOT_FOUND', detail: '該郵箱目前沒有可重置的帳號。' });

    await updateUserPassword(existing.id, password, req);
    await markAuthFlowUsed(verified.record.id);

    return json(res, 200, {
      ok: true,
      email: verified.record.email,
    });
  } catch (e: any) {
    return json(res, 500, { error: 'PASSWORD_RESET_CONFIRM_FAILED', detail: String(e?.message || e) });
  }
}
