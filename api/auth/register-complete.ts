import {
  createUser,
  createUsernameFromEmail,
  findUserByEmail,
  isStrongPassword,
  json,
  listUsers,
  markAuthFlowUsed,
  readBody,
  tokenErrorMessage,
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
    const verified = await verifyAuthFlow('register', token);
    if (!verified.ok) return json(res, 400, { error: verified.reason, detail: tokenErrorMessage(verified.reason) });

    const existing = await findUserByEmail(verified.record.email, req).catch(() => null);
    if (existing) return json(res, 409, { error: 'EMAIL_ALREADY_REGISTERED', detail: '此郵箱已完成註冊。' });

    const users = await listUsers(req);
    const username = createUsernameFromEmail(verified.record.email, users);
    await createUser(
      {
        username,
        email: verified.record.email,
        password,
        is_active: 1,
      },
      req
    );
    await markAuthFlowUsed(verified.record.id);

    return json(res, 200, {
      ok: true,
      email: verified.record.email,
      username,
    });
  } catch (e: any) {
    return json(res, 500, { error: 'REGISTER_COMPLETE_FAILED', detail: String(e?.message || e) });
  }
}
