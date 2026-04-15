import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ROOT = '/tmp/work4hk_worker_uploads';
const INDEX_FILE = path.join(ROOT, 'index.json');

const readJsonBody = async (req: any) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const ensureRoot = async () => {
  await fs.mkdir(ROOT, { recursive: true });
};

const readIndex = async (): Promise<Record<string, any>> => {
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeIndex = async (idx: Record<string, any>) => {
  await fs.writeFile(INDEX_FILE, JSON.stringify(idx), 'utf8');
};

const respond = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return respond(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    await ensureRoot();

    if (req.method === 'DELETE') {
      const body = await readJsonBody(req);
      const uid = String(body?.uid || '').trim();
      if (!uid) return respond(res, 400, { error: 'Missing uid' });

      const idx = await readIndex();
      const meta = idx[uid];
      if (meta?.stored_name) {
        const filePath = path.join(ROOT, meta.stored_name);
        await fs.unlink(filePath).catch(() => undefined);
      }
      delete idx[uid];
      await writeIndex(idx);
      return respond(res, 200, { ok: true });
    }

    const body = await readJsonBody(req);
    const category = String(body?.category || '').trim();
    const fileName = String(body?.file_name || '').trim();
    const mimeType = String(body?.mime_type || '').trim();
    const dataUrl = String(body?.data_url || '').trim();

    if (!category || !fileName || !mimeType || !dataUrl.startsWith('data:')) {
      return respond(res, 400, { error: 'Invalid payload' });
    }
    if (!ALLOWED.has(mimeType)) {
      return respond(res, 400, { error: 'Unsupported file type' });
    }

    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
    if (!base64) return respond(res, 400, { error: 'Invalid file data' });

    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > MAX_SIZE) return respond(res, 400, { error: 'File too large' });

    const ext = mimeType === 'application/pdf' ? '.pdf' : mimeType === 'image/png' ? '.png' : '.jpg';
    const uid = randomUUID();
    const digest = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
    const storedName = `${uid}-${digest}${ext}`;
    const filePath = path.join(ROOT, storedName);
    await fs.writeFile(filePath, bytes);

    const idx = await readIndex();
    idx[uid] = {
      uid,
      category,
      original_name: fileName,
      mime_type: mimeType,
      size: bytes.length,
      stored_name: storedName,
      stored_path: filePath,
      created_at: new Date().toISOString(),
    };
    await writeIndex(idx);

    return respond(res, 200, {
      uid,
      category,
      original_name: fileName,
      mime_type: mimeType,
      size: bytes.length,
    });
  } catch (e: any) {
    return respond(res, 500, { error: 'Upload failed', detail: String(e?.message || e) });
  }
}
