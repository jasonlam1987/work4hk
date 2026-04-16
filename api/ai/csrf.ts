import { randomUUID } from 'node:crypto';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' }));
    return;
  }
  const token = randomUUID().replace(/-/g, '');
  res.setHeader('Set-Cookie', `csrf_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax`);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ csrf_token: token }));
}
