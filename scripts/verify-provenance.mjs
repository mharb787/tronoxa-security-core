import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'provenance', 'bsc-files.sha256');
const manifest = await readFile(manifestPath, 'utf8');
const expected = new Map();

for (const line of manifest.trim().split('\n')) {
  const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
  if (!match) throw new Error(`Invalid provenance line: ${line}`);
  expected.set(match[2], match[1]);
}

async function walk(relativeDirectory) {
  const entries = await readdir(path.join(root, relativeDirectory), { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(relative));
    else if (!entry.name.endsWith('.map')) output.push(relative);
  }
  return output;
}

const actualFiles = [
  ...await walk('packages/bsc-core'),
  ...await walk('integrations/mobile-bsc'),
].sort();

const expectedFiles = [...expected.keys()].sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error('BSC provenance file set does not match the manifest');
}

for (const relative of actualFiles) {
  const digest = createHash('sha256')
    .update(await readFile(path.join(root, relative)))
    .digest('hex');
  if (digest !== expected.get(relative)) {
    throw new Error(`BSC provenance mismatch: ${relative}`);
  }
}

console.log(`Verified ${actualFiles.length} BSC provenance files.`);
