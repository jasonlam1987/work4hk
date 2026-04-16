import { issueCsrfToken, respond } from './_file_store';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  const token = issueCsrfToken();
  res.setHeader('Set-Cookie', `csrf_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax`);
  return respond(res, 200, { csrf_token: token });
}
