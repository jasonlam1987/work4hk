import { readJsonBody } from './_file_store.js';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
  const identifier = String(body?.identifier || body?.username || body?.email || '').trim();
  if (!identifier) return json(res, 200, { ok: true });
  return json(res, 200, { ok: true });
}

