import {
  buildResetLink,
  createAuthFlow,
  findUserByEmail,
  isValidEmail,
  json,
  maskEmail,
  readBody,
  sendAuthMail,
} from './_auth_common.js';

export { config } from './_auth_common.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  const body = await readBody(req);
  const email = String(body?.email || '').trim();
  if (!isValidEmail(email)) return json(res, 400, { error: 'EMAIL_INVALID' });

  try {
    const existing = await findUserByEmail(email, req).catch(() => null);
    if (existing) {
      const { token } = await createAuthFlow('reset', email);
      const sendResult = await sendAuthMail({
        to: email,
        subject: 'Work4HK 重置密碼',
        intro: '我們收到了你的密碼重置申請，請點擊以下鏈接重新設置密碼。',
        actionText: '重置密碼',
        actionUrl: buildResetLink(token),
      });
      if (sendResult.mode === 'file') {
        return json(res, 200, {
          ok: true,
          message: '重置郵件已生成',
          maskedEmail: maskEmail(email),
          previewFile: sendResult.previewFile,
        });
      }
    }
    return json(res, 200, {
      ok: true,
      message: '如果該郵箱已綁定帳號，重置鏈接已寄出。',
      maskedEmail: maskEmail(email),
    });
  } catch (e: any) {
    return json(res, 500, { error: 'PASSWORD_RESET_REQUEST_FAILED', detail: String(e?.message || e) });
  }
}
