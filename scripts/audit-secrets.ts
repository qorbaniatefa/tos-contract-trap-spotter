import { config } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

config({ quiet: true });
const secrets = Object.entries(process.env)
  .filter(
    ([name, value]) =>
      /(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/i.test(name) &&
      !!value &&
      value.length >= 8,
  )
  .map(([, value]) => value!);
const failures: string[] = [];
let scanned = 0;
let historyBlobs = 0;
const secretPatterns = [
  /AIza[A-Za-z0-9_-]{35}/,
  /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /sk_(?:live|test)_[A-Za-z0-9]{24,}/,
];
function containsSecret(bytes: Buffer) {
  const text = bytes.toString('utf8');
  return (
    secrets.some((secret) => bytes.includes(Buffer.from(secret))) ||
    secretPatterns.some((pattern) => pattern.test(text))
  );
}
async function scan(path: string): Promise<void> {
  if (!existsSync(path)) return;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) {
      if (!['.git', 'node_modules', '.cache'].includes(entry.name))
        await scan(file);
    } else {
      // Local dotenv files are the intentional secret store, never deliverables.
      if (/^\.env(?:\..*)?$/.test(entry.name) && entry.name !== '.env.example')
        continue;
      scanned++;
      if (containsSecret(await readFile(file))) failures.push(file);
    }
  }
}
await scan('.');
const scopedGit = [
  '-c',
  `safe.directory=${process.cwd().replaceAll('\\', '/')}`,
];
const ignored = spawnSync('git', [...scopedGit, 'check-ignore', '.env'], {
  encoding: 'utf8',
  windowsHide: true,
});
const tracked = spawnSync(
  'git',
  [...scopedGit, 'ls-files', '--error-unmatch', '.env'],
  {
    encoding: 'utf8',
    windowsHide: true,
  },
);
if (ignored.status !== 0 || tracked.status !== 1)
  failures.push('.env Git exclusion');
const history = spawnSync(
  'git',
  [...scopedGit, 'rev-list', '--objects', '--all', '--reflog'],
  {
    encoding: 'utf8',
    windowsHide: true,
  },
);
if (history.status !== 0) failures.push('Git history could not be audited');
for (const line of history.stdout.trim().split('\n').filter(Boolean)) {
  const [oid, ...parts] = line.split(' ');
  const path = parts.join(' ');
  if (/(?:^|\/)\.env(?:\..*)?$/.test(path) && !path.endsWith('.env.example'))
    failures.push(`Git history forbidden file: ${path}`);
  const type = spawnSync('git', [...scopedGit, 'cat-file', '-t', oid], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (type.status !== 0) {
    failures.push('Git object could not be inspected');
    continue;
  }
  if (type.stdout.trim() !== 'blob') continue;
  const blob = spawnSync('git', [...scopedGit, 'cat-file', 'blob', oid], {
    windowsHide: true,
    maxBuffer: 110 * 1024 * 1024,
  });
  historyBlobs++;
  if (blob.status !== 0) failures.push(`Git blob could not be audited: ${oid}`);
  else if (containsSecret(blob.stdout))
    failures.push(`Git history secret: ${path || oid}`);
}
console.log(
  JSON.stringify(
    {
      scannedFiles: scanned,
      historyBlobs,
      excludedLocalStores: [
        '.env files',
        '.git internals',
        'node_modules',
        '.cache',
      ],
      credentialsFound: failures.length > 0,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
