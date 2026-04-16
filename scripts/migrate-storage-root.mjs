import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LEGACY_STORAGE_ROOT = path.join(os.tmpdir(), 'work4hk_files');
const getStorageRoot = () => String(process.env.FILE_STORAGE_ROOT || '').trim() || 'C:\\Users\\88513\\iCloudDrive\\work4hk';

const copyWithMeta = async (source, target) => {
  await fs.copyFile(source, target);
  const st = await fs.stat(source);
  await fs.utimes(target, st.atime, st.mtime).catch(() => undefined);
  await fs.chmod(target, st.mode).catch(() => undefined);
};

const walkAndCopy = async (sourceRoot, targetRoot, rel, report) => {
  const sourcePath = rel ? path.join(sourceRoot, rel) : sourceRoot;
  const items = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const item of items) {
    const nextRel = rel ? path.join(rel, item.name) : item.name;
    const from = path.join(sourceRoot, nextRel);
    const to = path.join(targetRoot, nextRel);
    if (item.isDirectory()) {
      await fs.mkdir(to, { recursive: true });
      report.copiedDirs.push(to);
      await walkAndCopy(sourceRoot, targetRoot, nextRel, report);
      continue;
    }
    if (!item.isFile()) continue;
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await copyWithMeta(from, to);
      report.copiedFiles.push({ source: from, target: to });
    } catch (e) {
      report.failed.push({ source: from, target: to, reason: String(e?.message || e) });
    }
  }
};

const migrateLegacyStorageToNewRoot = async (legacyRoot = LEGACY_STORAGE_ROOT, targetRoot = getStorageRoot()) => {
  const startedAt = new Date().toISOString();
  const report = {
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

const run = async () => {
  const source = LEGACY_STORAGE_ROOT;
  const target = getStorageRoot();
  const report = await migrateLegacyStorageToNewRoot(source, target);
  const ok = report.failed.length === 0;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    sourceRoot: report.sourceRoot,
    targetRoot: report.targetRoot,
    copiedFiles: report.copiedFiles.length,
    copiedDirs: report.copiedDirs.length,
    failed: report.failed.length,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    status: ok ? 'SUCCESS' : 'PARTIAL_FAILED',
  }, null, 2));
  if (!ok) process.exitCode = 1;
};

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-storage-root] failed', e);
  process.exitCode = 1;
});
