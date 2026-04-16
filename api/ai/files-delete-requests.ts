import { ensureDirs, parseRole, readIndex, respond, verifyRole } from './_file_store';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
  try {
    await ensureDirs();
    const idx = await readIndex();
    const role = parseRole(req);
    const all = Object.values(idx.delete_requests || {}).sort((a: any, b: any) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
    const items = role.includes('super') ? all : all.filter((it: any) => it.status === 'PENDING');
    return respond(res, 200, { items });
  } catch (e: any) {
    return respond(res, 500, { code: 'LIST_FAILED', error: 'list failed', detail: String(e?.message || e) });
  }
}
