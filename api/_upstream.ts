const getBackendOrigin = () => {
  const raw = String(process.env.BACKEND_ORIGIN || 'https://119.91.50.192').trim();
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const getBackendHost = () => String(process.env.BACKEND_HOST || '').trim();

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

export const buildUpstreamHeaders = (req: any) => {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    const key = String(k || '').toLowerCase();
    if (!key || hopByHopHeaders.has(key)) continue;
    if (Array.isArray(v)) headers[key] = v.join(', ');
    else if (typeof v === 'string') headers[key] = v;
  }
  const backendHost = getBackendHost();
  if (backendHost) headers['host'] = backendHost;
  return headers;
};

export const upstreamFetch = async (pathWithQuery: string, init: RequestInit) => {
  const origin = getBackendOrigin();
  const path = String(pathWithQuery || '/').startsWith('/') ? String(pathWithQuery || '/') : `/${pathWithQuery}`;
  return fetch(`${origin}${path}`, init);
};

export const readRequestBodyIfAny = async (req: any) => {
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;
  return await readRawBody(req);
};

