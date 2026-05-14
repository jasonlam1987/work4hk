const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const getBackendOrigin = () => {
  const raw = String(process.env.BACKEND_ORIGIN || 'http://119.91.50.192').trim();
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const joinUpstreamUrl = (backendOrigin: string, reqUrl: string) => {
  const origin = backendOrigin.replace(/\/+$/, '');
  const path = String(reqUrl || '/').startsWith('/') ? String(reqUrl || '/') : `/${reqUrl}`;

  if ((origin.endsWith('/api') || origin.endsWith('/api/')) && path.startsWith('/api/')) {
    return `${origin.replace(/\/api\/?$/, '')}${path}`;
  }

  return `${origin}${path}`;
};

const readRawBody = async (req: any): Promise<Buffer> => {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf-8');
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body), 'utf-8');
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve());
  });
  return Buffer.concat(chunks);
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
  'host',
]);

export default async function handler(req: any, res: any) {
  const backendOrigin = getBackendOrigin();
  const upstreamUrl = joinUpstreamUrl(backendOrigin, req.url || '/');
  const method = String(req.method || 'GET').toUpperCase();

  try {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers || {})) {
      const key = String(k || '').toLowerCase();
      if (!key || hopByHopHeaders.has(key)) continue;
      if (Array.isArray(v)) headers[key] = v.join(', ');
      else if (typeof v === 'string') headers[key] = v;
    }

    const body = method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(req);
    const upstream = await fetch(upstreamUrl, {
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
    return json(res, 502, {
      error: 'Upstream proxy failed',
      detail: String(e?.message || e),
    });
  }
}

