import {
  buildRegisterLink,
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
    if (!existing) {
      const { token } = await createAuthFlow('register', email);
      const sendResult = await sendAuthMail({
        to: email,
        subject: 'Work4HK 郵箱驗證',
        intro: '請先驗證你的郵箱，驗證成功後即可設置密碼並完成註冊。',
        actionText: '驗證郵箱並設置密碼',
        actionUrl: buildRegisterLink(token),
      });
      if (sendResult.mode === 'file') {
        return json(res, 200, {
          ok: true,
          message: '驗證郵件已生成',
          maskedEmail: maskEmail(email),
          previewFile: sendResult.previewFile,
        });
      }
    }
    return json(res, 200, {
      ok: true,
      message: '如果郵箱可用，驗證鏈接已寄出。',
      maskedEmail: maskEmail(email),
    });
  } catch (e: any) {
    return json(res, 500, { error: 'REGISTER_REQUEST_FAILED', detail: String(e?.message || e) });
  }
}
