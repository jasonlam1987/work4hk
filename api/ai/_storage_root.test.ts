import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureStorageReady,
  getPermissionSuggestion,
  getStoragePaths,
  getStorageRoot,
  migrateLegacyStorageToNewRoot,
  resetStorageReadyCacheForTest,
  verifyStoragePermissions,
} from './_storage_root';

const tempRoot = () => path.join(os.tmpdir(), `work4hk-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

describe('storage root manager', () => {
  afterEach(async () => {
    resetStorageReadyCacheForTest();
    vi.restoreAllMocks();
    delete process.env.FILE_STORAGE_ROOT;
  });

  it('uses FILE_STORAGE_ROOT when provided', () => {
    process.env.FILE_STORAGE_ROOT = 'C:\\custom\\work4hk';
    expect(getStorageRoot()).toBe('C:\\custom\\work4hk');
  });

  it('auto creates storage directories and checks permission', async () => {
    const root = tempRoot();
    process.env.FILE_STORAGE_ROOT = root;
    const ready = await ensureStorageReady();
    expect(ready.paths.root).toBe(root);
    expect(await fs.stat(ready.paths.root)).toBeTruthy();
    expect(await fs.stat(ready.paths.tmpDir)).toBeTruthy();
    expect(await fs.stat(ready.paths.dataDir)).toBeTruthy();
    expect(await fs.stat(ready.paths.reportsDir)).toBeTruthy();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('throws clear message when permission check fails', async () => {
    const root = tempRoot();
    const paths = getStoragePaths(root);
    await fs.mkdir(root, { recursive: true });
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('EPERM'));
    let message = '';
    try {
      await verifyStoragePermissions(paths);
    } catch (e: any) {
      message = String(e?.message || e);
    }
    expect(message).toContain('STORAGE_PERMISSION_DENIED');
    expect(message).toContain(getPermissionSuggestion(root));
    await fs.rm(root, { recursive: true, force: true });
  });

  it('migrates legacy files preserving structure and writes report', async () => {
    const source = tempRoot();
    const target = tempRoot();
    await fs.mkdir(path.join(source, 'data', 'nested'), { recursive: true });
    await fs.mkdir(path.join(source, 'tmp'), { recursive: true });
    await fs.writeFile(path.join(source, 'data', 'nested', 'a.txt'), 'hello', 'utf8');
    await fs.writeFile(path.join(source, 'tmp', 'b.tmp'), 'world', 'utf8');

    const report = await migrateLegacyStorageToNewRoot(source, target);
    expect(report.failed.length).toBe(0);
    const copied = await fs.readFile(path.join(target, 'data', 'nested', 'a.txt'), 'utf8');
    expect(copied).toBe('hello');
    const reportFiles = await fs.readdir(path.join(target, 'migration-reports'));
    expect(reportFiles.some((n) => n.startsWith('migration-'))).toBe(true);

    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(target, { recursive: true, force: true });
  });
});
