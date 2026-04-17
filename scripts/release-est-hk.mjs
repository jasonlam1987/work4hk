import fs from 'node:fs';
import path from 'node:path';

const versionPath = path.resolve(process.cwd(), 'src/version.json');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const bumpPatch = (version) => {
  const m = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid semver: ${version}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
};

const info = readJson(versionPath);
const releaseVersion = String(info.devVersion || '').trim();
if (!releaseVersion) {
  throw new Error('devVersion is empty in src/version.json');
}

const nextDevVersion = bumpPatch(releaseVersion);
const next = {
  ...info,
  cloudVersion: releaseVersion,
  devVersion: nextDevVersion,
  releasedAt: new Date().toISOString(),
};

writeJson(versionPath, next);

console.log(`[release-est-hk] cloudVersion=${next.cloudVersion}`);
console.log(`[release-est-hk] next devVersion=${next.devVersion}`);
