import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const toDataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;

test('file api upload/download across modules', async ({ request }) => {
  const samples = [
    { mime: 'application/pdf', name: 'e2e-a.pdf', bytes: Buffer.from('%PDF-1.4\ne2e\n%%EOF', 'utf8') },
    { mime: 'image/jpeg', name: 'e2e-b.jpg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]) },
    { mime: 'image/png', name: 'e2e-c.png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]) },
  ] as const;
  const modules = ['employers', 'approvals', 'workers'] as const;

  for (const moduleName of modules) {
    for (const sample of samples) {
      const up = await request.post('/api/ai/files', {
        headers: { 'x-user-role': 'admin' },
        data: {
          module: moduleName,
          owner_id: 1,
          folder: 'e2e',
          file_name: sample.name,
          mime_type: sample.mime,
          data_url: toDataUrl(sample.mime, sample.bytes),
        },
      });
      expect(up.ok()).toBeTruthy();
      const json = await up.json();
      expect(json.code).toBeUndefined();
      expect(json.download_url).toBeTruthy();

      const dl = await request.get(json.download_url, { headers: { 'x-user-role': 'admin' } });
      expect(dl.ok()).toBeTruthy();
      const body = await dl.body();
      const sha = createHash('sha256').update(body).digest('hex');
      expect(sha).toBe(json.sha256);
      expect(dl.headers()['content-type']).toContain(sample.mime === 'application/pdf' ? 'application/pdf' : 'image/');
    }
  }
});

test('file api returns clear error code for oversized upload', async ({ request }) => {
  const large = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
  const up = await request.post('/api/ai/files', {
    headers: { 'x-user-role': 'admin' },
    data: {
      module: 'workers',
      owner_id: 1,
      folder: 'e2e',
      file_name: 'too-large.pdf',
      mime_type: 'application/pdf',
      data_url: toDataUrl('application/pdf', large),
    },
  });
  expect(up.status()).toBe(400);
  const json = await up.json();
  expect(json.code).toBe('FILE_TOO_LARGE');
});
