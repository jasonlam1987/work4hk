import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createOneTimeToken,
  ensureDirs,
  readIndex,
  storeFileFromDataUrl,
  verifyOneTimeToken,
  verifyRole,
  writeIndex,
} from './_file_store';

const toDataUrl = (mime: string, content: Buffer) => `data:${mime};base64,${content.toString('base64')}`;

const uploadCases = [
  { mime: 'application/pdf', name: 'sample.pdf', bytes: Buffer.from('%PDF-1.4\nwork4hk\n%%EOF', 'utf8') },
  { mime: 'image/jpeg', name: 'sample.jpg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]) },
  { mime: 'image/png', name: 'sample.png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]) },
] as const;

const modules = ['employers', 'approvals', 'workers'] as const;
const envProfiles = ['development', 'testing', 'production'] as const;

describe('file flow verification', () => {
  it('uploads and verifies sha256 across all modules and file types', async () => {
    await ensureDirs();
    const idx = await readIndex();
    idx.records = {};
    idx.used_tokens = {};
    await writeIndex(idx);

    const records: Array<{ env: string; module: string; file: string; uid: string; elapsedMs: number; size: number; sha256: string }> = [];

    for (const envName of envProfiles) {
      for (const moduleName of modules) {
        for (let i = 0; i < uploadCases.length; i += 1) {
          const sample = uploadCases[i];
          const started = Date.now();
          const rec = await storeFileFromDataUrl({
            module: moduleName,
            owner_id: i + 1,
            folder: `${envName}-驗證`,
            file_name: `${envName}-${moduleName}-${sample.name}`,
            mime_type: sample.mime,
            data_url: toDataUrl(sample.mime, sample.bytes),
          });
          const elapsedMs = Date.now() - started;
          const downloaded = await fs.readFile(rec.stored_path);
          const downloadedSha = createHash('sha256').update(downloaded).digest('hex');
          expect(downloadedSha).toBe(rec.sha256);
          records.push({
            env: envName,
            module: moduleName,
            file: sample.name,
            uid: rec.uid,
            elapsedMs,
            size: rec.size,
            sha256: downloadedSha,
          });
        }
      }
    }

    const lines = [
      '# 檔案上傳下載驗證報告',
      '',
      '| Environment | Module | File | Size(bytes) | Upload+Verify(ms) | SHA-256 |',
      '|---|---|---|---:|---:|---|',
      ...records.map(r => `| ${r.env} | ${r.module} | ${r.file} | ${r.size} | ${r.elapsedMs} | ${r.sha256} |`),
      '',
      `- Total Cases: ${records.length}`,
      '- Integrity Check: all matched',
    ];
    const reportPath = path.resolve(process.cwd(), 'docs', 'file-upload-download-verification.md');
    await fs.writeFile(reportPath, lines.join('\n'), 'utf8');

    expect(records).toHaveLength(27);
    expect(records.every(r => r.elapsedMs >= 0)).toBe(true);
  });

  it('supports permission/token checks and resume token flow', async () => {
    expect(verifyRole({ headers: { 'x-user-role': 'admin' } })).toBe(true);
    expect(verifyRole({ headers: { 'x-user-role': 'viewer' } })).toBe(false);

    const uid = 'resume-case-uid';
    const firstToken = createOneTimeToken(uid);
    const firstUse = verifyOneTimeToken(uid, firstToken, {});
    expect(firstUse.ok).toBe(true);
    const secondUse = verifyOneTimeToken(uid, firstToken, { [firstToken]: new Date().toISOString() });
    expect(secondUse.ok).toBe(false);

    const resumedToken = createOneTimeToken(uid);
    const resumedUse = verifyOneTimeToken(uid, resumedToken, {});
    expect(resumedUse.ok).toBe(true);
  });

  it('rejects files larger than 10MB', async () => {
    const large = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    await expect(
      storeFileFromDataUrl({
        module: 'workers',
        owner_id: 1,
        folder: '超限',
        file_name: 'too-large.pdf',
        mime_type: 'application/pdf',
        data_url: toDataUrl('application/pdf', large),
      })
    ).rejects.toThrow('file too large');
  });
});
