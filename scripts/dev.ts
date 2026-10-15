import { watch } from 'node:fs';
import { buildExtension } from './build';

await buildExtension();
await import('../src/server/main');
console.log(
  'Extension source changes rebuild dist/extension. Reload it at chrome://extensions. Restart this command for server changes.',
);
let pending: ReturnType<typeof setTimeout>;
let building = false;
watch('src/extension', { recursive: true }, () => {
  clearTimeout(pending);
  pending = setTimeout(async () => {
    if (building) return;
    building = true;
    try {
      await buildExtension();
    } catch {
      console.error('Build failed; inspect source changes.');
    } finally {
      building = false;
    }
  }, 250);
});
