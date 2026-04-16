import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_STORAGE_ROOT = 'C:\\Users\\88513\\iCloudDrive\\work4hk';
export const LEGACY_STORAGE_ROOT = path.join(os.tmpdir(), 'work4hk_files');

export type StoragePaths = {
  root: string;
  tmpDir: string;
  dataDir: string;
  indexFile: string;
  reportsDir: string;
};

export type EnsureStorageResult = {
  paths: StoragePaths;
  createdDirs: string[];
  permissionsChecked: boolean;
};

let cachedReady: EnsureStorageResult | null = null;

export const getStorageRoot = () => {
  const fromEnv = String(process.env.FILE_STORAGE_ROOT || '').trim();
  if (fromEnv) return fromEnv;
  if (process.platform === 'win32') return DEFAULT_STORAGE_ROOT;
  return path.join(os.tmpdir(), 'work4hk');
};

export const getStoragePaths = (root = getStorageRoot()): StoragePaths => ({
  root,
  tmpDir: path.join(root, 'tmp'),
  dataDir: path.join(root, 'data'),
  indexFile: path.join(root, 'index.json'),
  reportsDir: path.join(root, 'migration-reports'),
});

const ensureSingleDir = async (dir: string) => {
  try {
    await fs.access(dir);
    return false;
  } catch {
    await fs.mkdir(dir, { recursive: true });
    return true;
  }
};

export const getPermissionSuggestion = (root: string) =>
  `請確認路徑「${root}」存在且目前帳號具備讀寫權限；Windows 可於資料夾內容的「安全性」頁面授予 Full Control，並確認 iCloudDrive 已完成同步。`;

export const verifyStoragePermissions = async (paths: StoragePaths) => {
  const probeFile = path.join(paths.root, `.permission_probe_${Date.now()}.tmp`);
  try {
    await fs.writeFile(probeFile, 'probe', 'utf8');
    const content = await fs.readFile(probeFile, 'utf8');
    if (content !== 'probe') throw new Error('permission probe content mismatch');
  } catch (e: any) {
    const detail = String(e?.message || e);
    throw new Error(`STORAGE_PERMISSION_DENIED: ${detail}. ${getPermissionSuggestion(paths.root)}`);
  } finally {
    await fs.unlink(probeFile).catch(() => undefined);
  }
};

export const ensureStorageReady = async () => {
  if (cachedReady) return cachedReady;
  const paths = getStoragePaths();
  const createdDirs: string[] = [];
  const dirList = [paths.root, paths.tmpDir, paths.dataDir, paths.reportsDir];
  for (const dir of dirList) {
    const created = await ensureSingleDir(dir);
    if (created) createdDirs.push(dir);
  }
  await verifyStoragePermissions(paths);
  cachedReady = { paths, createdDirs, permissionsChecked: true };
  if (createdDirs.length > 0) {
    console.info('[storage] created directories', createdDirs);
  }
  return cachedReady;
};

export const resetStorageReadyCacheForTest = () => {
  cachedReady = null;
};

type MigrateResult = {
  sourceRoot: string;
  targetRoot: string;
  startedAt: string;
  finishedAt: string;
  copiedFiles: Array<{ source: string; target: string }>;
  copiedDirs: string[];
  failed: Array<{ source: string; target: string; reason: string }>;
};

const copyWithMeta = async (source: string, target: string) => {
  await fs.copyFile(source, target);
  const st = await fs.stat(source);
  await fs.utimes(target, st.atime, st.mtime).catch(() => undefined);
  await fs.chmod(target, st.mode).catch(() => undefined);
};

const walkAndCopy = async (
  sourceRoot: string,
  targetRoot: string,
  rel: string,
  result: MigrateResult
) => {
  const sourcePath = rel ? path.join(sourceRoot, rel) : sourceRoot;
  const items = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const item of items) {
    const nextRel = rel ? path.join(rel, item.name) : item.name;
    const from = path.join(sourceRoot, nextRel);
    const to = path.join(targetRoot, nextRel);
    if (item.isDirectory()) {
      await fs.mkdir(to, { recursive: true });
      result.copiedDirs.push(to);
      await walkAndCopy(sourceRoot, targetRoot, nextRel, result);
      continue;
    }
    if (!item.isFile()) continue;
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await copyWithMeta(from, to);
      result.copiedFiles.push({ source: from, target: to });
    } catch (e: any) {
      result.failed.push({ source: from, target: to, reason: String(e?.message || e) });
    }
  }
};

export const migrateLegacyStorageToNewRoot = async (legacyRoot = LEGACY_STORAGE_ROOT, targetRoot = getStorageRoot()) => {
  const startedAt = new Date().toISOString();
  const report: MigrateResult = {
    sourceRoot: legacyRoot,
    targetRoot,
    startedAt,
    finishedAt: startedAt,
    copiedFiles: [],
    copiedDirs: [],
    failed: [],
  };
  await fs.mkdir(targetRoot, { recursive: true });
  try {
    await fs.access(legacyRoot);
  } catch {
    report.finishedAt = new Date().toISOString();
    return report;
  }
  await walkAndCopy(legacyRoot, targetRoot, '', report);
  report.finishedAt = new Date().toISOString();
  const reportDir = path.join(targetRoot, 'migration-reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `migration-${Date.now()}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
  return report;
};
