import { buildUpstreamHeaders, readRequestBodyIfAny, upstreamFetch } from './_upstream';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export default async function handler(req: any, res: any) {
  const upstreamUrl = String(req.url || '/');
  const method = String(req.method || 'GET').toUpperCase();

  try {
    const headers = buildUpstreamHeaders(req);
    const body = await readRequestBodyIfAny(req);
    const upstream = await upstreamFetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
    } as any);

    res.statusCode = upstream.status;
    upstream.headers.forEach((val, key) => {
      const k = String(key || '').toLowerCase();
      if (!k || hopByHopHeaders.has(k)) return;
      res.setHeader(key, val);
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e: any) {
    return json(res, 502, { error: 'Upstream proxy failed', detail: String(e?.message || e) });
  }
}

