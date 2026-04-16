import { describe, expect, it } from 'vitest';
import filesDeleteHandler from './files-delete';
import filesDeleteRequestHandler from './files-delete-request';
import filesDeleteReviewHandler from './files-delete-review';
import { ensureDirs, readIndex, storeFileFromDataUrl, writeIndex } from './_file_store';

const makeReq = (method: string, body: any, headers: Record<string, string> = {}, query: Record<string, any> = {}) => {
  const payload = Buffer.from(JSON.stringify(body || {}), 'utf8');
  return {
    method,
    headers,
    query,
    socket: { remoteAddress: '127.0.0.1' },
    [Symbol.asyncIterator]: async function* () {
      yield payload;
    },
  } as any;
};

const makeRes = () => {
  const state: any = { headers: {}, body: '' };
  return {
    state,
    statusCode: 0,
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
    },
    end: (val: string) => {
      state.body = val;
    },
  } as any;
};

const roleHeaders = (role: string) => ({
  'x-user-role': role,
  'x-user-id': 'u-1',
  'x-user-name': 'tester',
  cookie: 'csrf_token=csrf-123',
  'x-csrf-token': 'csrf-123',
  'user-agent': 'vitest',
});

const makeFile = async () => {
  const rec = await storeFileFromDataUrl({
    module: 'employers',
    owner_id: 1,
    folder: '企業資料',
    file_name: 'a.pdf',
    mime_type: 'application/pdf',
    data_url: `data:application/pdf;base64,${Buffer.from('hello', 'utf8').toString('base64')}`,
  });
  const idx = await readIndex();
  idx.records[rec.uid] = rec;
  await writeIndex(idx);
  return rec.uid;
};

describe('file delete security flow', () => {
  it('blocks non-super-admin physical delete', async () => {
    await ensureDirs();
    await writeIndex({ records: {}, used_tokens: {}, delete_requests: {}, audit_logs: [] });
    const uid = await makeFile();
    const req = makeReq('POST', { uid, confirm_text: 'DELETE' }, roleHeaders('admin'));
    const res = makeRes();
    await filesDeleteHandler(req, res);
    const body = JSON.parse(String(res.state.body || '{}'));
    expect(res.statusCode).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('creates and prevents duplicate pending delete requests', async () => {
    await ensureDirs();
    await writeIndex({ records: {}, used_tokens: {}, delete_requests: {}, audit_logs: [] });
    const uid = await makeFile();

    const req1 = makeReq(
      'POST',
      { uid, reason: '資料重複', company_name: 'A 公司', section_name: '企業資料' },
      roleHeaders('manager')
    );
    const res1 = makeRes();
    await filesDeleteRequestHandler(req1, res1);
    const body1 = JSON.parse(String(res1.state.body || '{}'));
    expect(res1.statusCode).toBe(200);
    expect(body1.code).toBe('DELETE_REQUEST_CREATED');

    const req2 = makeReq(
      'POST',
      { uid, reason: '再次申請', company_name: 'A 公司', section_name: '企業資料' },
      roleHeaders('manager')
    );
    const res2 = makeRes();
    await filesDeleteRequestHandler(req2, res2);
    const body2 = JSON.parse(String(res2.state.body || '{}'));
    expect(res2.statusCode).toBe(409);
    expect(body2.code).toBe('DUPLICATE_PENDING_REQUEST');
  });

  it('approves request and performs physical delete once', async () => {
    await ensureDirs();
    await writeIndex({ records: {}, used_tokens: {}, delete_requests: {}, audit_logs: [] });
    const uid = await makeFile();

    const createReq = makeReq(
      'POST',
      { uid, reason: '資料重複', company_name: 'A 公司', section_name: '企業資料' },
      roleHeaders('manager')
    );
    const createRes = makeRes();
    await filesDeleteRequestHandler(createReq, createRes);
    const created = JSON.parse(String(createRes.state.body || '{}'));
    const requestId = created?.request?.request_id;

    const approveReq = makeReq('POST', { request_id: requestId, action: 'APPROVE' }, roleHeaders('super_admin'));
    const approveRes = makeRes();
    await filesDeleteReviewHandler(approveReq, approveRes);
    const approved = JSON.parse(String(approveRes.state.body || '{}'));
    expect(approveRes.statusCode).toBe(200);
    expect(approved.code).toBe('REQUEST_APPROVED_AND_FILE_DELETED');

    const approveAgainReq = makeReq('POST', { request_id: requestId, action: 'APPROVE' }, roleHeaders('super_admin'));
    const approveAgainRes = makeRes();
    await filesDeleteReviewHandler(approveAgainReq, approveAgainRes);
    const approvedAgain = JSON.parse(String(approveAgainRes.state.body || '{}'));
    expect(approveAgainRes.statusCode).toBe(409);
    expect(approvedAgain.code).toBe('REQUEST_ALREADY_REVIEWED');
  });
});
