import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

if (existsSync('src/extension/vendor/page-agent-dom/dom-tree.js')) {
  throw new Error(
    'Vendored source already exists. Preserve and review ADAPTATIONS.md before deliberately re-vendoring; this command will not overwrite local safety changes.',
  );
}

const api = await fetch(
  'https://api.github.com/repos/alibaba/page-agent/git/ref/tags/v1.12.4',
);
if (!api.ok) throw new Error(`Upstream tag lookup failed: ${api.status}`);
const ref = (await api.json()) as { object: { sha: string; type: string } };
let commit = ref.object.sha;
if (ref.object.type === 'tag') {
  const tag = await fetch(
    `https://api.github.com/repos/alibaba/page-agent/git/tags/${commit}`,
  );
  commit = ((await tag.json()) as { object: { sha: string } }).object.sha;
}
const base = `https://raw.githubusercontent.com/alibaba/page-agent/${commit}`;
const directory = 'src/extension/vendor/page-agent-dom';
await mkdir(directory, { recursive: true });
const hashes: Record<string, string> = {};
for (const [remote, local] of [
  ['packages/page-controller/src/dom/dom_tree/index.js', 'dom-tree.js'],
  ['LICENSE', 'LICENSE'],
]) {
  const response = await fetch(`${base}/${remote}`);
  if (!response.ok) throw new Error(`Download failed: ${remote}`);
  const content = await response.text();
  hashes[local] = createHash('sha256').update(content).digest('hex');
  await writeFile(`${directory}/${local}`, content);
}
await writeFile(
  `${directory}/provenance.json`,
  JSON.stringify(
    {
      repository: 'https://github.com/alibaba/page-agent',
      tag: 'v1.12.4',
      commit,
      retrievedAt: new Date().toISOString(),
      hashes,
      modifications: [],
    },
    null,
    2,
  ) + '\n',
);
console.log(`Vendored read-only DOM source from ${commit}`);
