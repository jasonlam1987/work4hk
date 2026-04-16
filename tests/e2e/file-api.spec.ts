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

test('delete request flow updates status and deletes physical file on approve', async ({ request }) => {
  const ownerId = 321;
  const up = await request.post('/api/ai/files', {
    headers: { 'x-user-role': 'manager', 'x-user-id': 'louise', 'x-user-name': 'louise' },
    data: {
      module: 'employers',
      owner_id: ownerId,
      folder: '企業資料',
      file_name: 'delete-flow.pdf',
      mime_type: 'application/pdf',
      data_url: toDataUrl('application/pdf', Buffer.from('%PDF-1.4\ndelete-flow\n%%EOF', 'utf8')),
    },
  });
  expect(up.ok()).toBeTruthy();
  const uploaded = await up.json();

  const csrfResp = await request.get('/api/ai/csrf');
  const csrf = await csrfResp.json();
  const token = String(csrf?.csrf_token || '');
  expect(token.length).toBeGreaterThan(10);

  const createReq = await request.post('/api/ai/files-delete-request', {
    headers: {
      'x-user-role': 'manager',
      'x-user-id': 'louise',
      'x-user-name': 'louise',
      'x-csrf-token': token,
    },
    data: {
      uid: uploaded.uid,
      module: 'employers',
      owner_id: ownerId,
      folder: '企業資料',
      file_name: uploaded.original_name,
      object_path: uploaded.object_path,
      stored_path: uploaded.stored_path,
      uploader_id: uploaded.uploader_id,
      uploader_name: uploaded.uploader_name,
      reason: '錯誤上傳',
      company_name: '測試公司',
      section_name: '企業資料',
    },
  });
  expect(createReq.ok()).toBeTruthy();
  const created = await createReq.json();
  expect(created.code).toBe('DELETE_REQUEST_CREATED');

  const listByRequester = await request.get('/api/ai/files-delete-requests', {
    headers: { 'x-user-role': 'manager', 'x-user-id': 'louise', 'x-user-name': 'louise' },
  });
  expect(listByRequester.ok()).toBeTruthy();
  const listed = await listByRequester.json();
  const pending = (listed.items || []).find((x: any) => x.uid === uploaded.uid);
  expect(pending?.status).toBe('PENDING');

  const listBySuper = await request.get('/api/ai/files-delete-requests', {
    headers: { 'x-user-role': 'super_admin', 'x-user-id': 'root', 'x-user-name': 'root' },
  });
  expect(listBySuper.ok()).toBeTruthy();
  const listedBySuper = await listBySuper.json();
  const pendingBySuper = (listedBySuper.items || []).find((x: any) => x.uid === uploaded.uid);
  expect(pendingBySuper?.status).toBe('PENDING');

  const duplicate = await request.post('/api/ai/files-delete-request', {
    headers: {
      'x-user-role': 'manager',
      'x-user-id': 'louise',
      'x-user-name': 'louise',
      'x-csrf-token': token,
    },
    data: {
      uid: uploaded.uid,
      module: 'employers',
      owner_id: ownerId,
      folder: '企業資料',
      file_name: uploaded.original_name,
      object_path: uploaded.object_path,
      stored_path: uploaded.stored_path,
      uploader_id: uploaded.uploader_id,
      uploader_name: uploaded.uploader_name,
      reason: '錯誤上傳',
      company_name: '測試公司',
      section_name: '企業資料',
    },
  });
  expect(duplicate.status()).toBe(409);

  const approve = await request.post('/api/ai/files-delete-review', {
    headers: {
      'x-user-role': 'super_admin',
      'x-user-id': 'root',
      'x-user-name': 'root',
      'x-csrf-token': token,
    },
    data: {
      request_id: pending.request_id,
      action: 'APPROVE',
    },
  });
  expect(approve.ok()).toBeTruthy();
  const approved = await approve.json();
  expect(approved.code).toBe('REQUEST_APPROVED_AND_FILE_DELETED');

  const dl = await request.get(uploaded.download_url, { headers: { 'x-user-role': 'manager' } });
  expect(dl.ok()).toBeFalsy();
});
