import { build } from 'vite';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { ajv } from '../src/analysis/validators';

export async function buildExtension() {
  await mkdir('.cache', { recursive: true });
  let validators = standaloneCode(ajv, {
    candidateValid: 'candidate',
    reportValid: 'report',
    snapshotValid: 'snapshot',
  });
  validators = validators.replaceAll(
    'require("ajv/dist/runtime/ucs2length").default',
    'ucs2length',
  );
  validators = `const ucs2length = (value) => [...value].length;\n${validators}`;
  await writeFile('.cache/validators.js', validators);
  const resolveConfig = {
    alias: [
      {
        find: /^\.\/validators$/,
        replacement: resolve('.cache/validators.js'),
      },
      {
        find: /^\.\.\/analysis\/validators$/,
        replacement: resolve('.cache/validators.js'),
      },
    ],
  };
  const output = resolve('dist/extension');
  await build({
    configFile: false,
    resolve: resolveConfig,
    root: resolve('src/extension'),
    base: './',
    build: {
      outDir: output,
      emptyOutDir: true,
      target: 'es2022',
      rolldownOptions: { input: resolve('src/extension/report.html') },
    },
  });
  for (const entry of ['background', 'capture']) {
    await build({
      configFile: false,
      resolve: resolveConfig,
      build: {
        outDir: output,
        emptyOutDir: false,
        target: 'es2022',
        lib: {
          entry: resolve(`src/extension/${entry}.ts`),
          name: `Tos${entry}`,
          formats: ['iife'],
          fileName: () => `${entry}.js`,
        },
      },
    });
  }
  const manifest = {
    manifest_version: 3,
    name: 'Madde — ToS Trap Spotter',
    version: '1.0.0',
    description:
      'Alıntıya dayalı Türkçe sözleşme risk raporu. Hukuki tavsiye vermez.',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['http://127.0.0.1:4318/*'],
    action: { default_title: 'Bu sözleşmeyi incele' },
    icons: {
      '16': 'assets/icon16.png',
      '48': 'assets/icon48.png',
      '128': 'assets/icon128.png',
    },
    background: { service_worker: 'background.js' },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; connect-src http://127.0.0.1:4318;",
    },
  };
  await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2));
  await cp('assets', `${output}/assets`, { recursive: true });
  // Only the automation build exposes its real report to the local Cypress frame.
  await mkdir('dist/test-extension', { recursive: true });
  await cp(output, 'dist/test-extension', { recursive: true });
  const testManifest = {
    ...manifest,
    host_permissions: [...manifest.host_permissions, 'http://127.0.0.1:4319/*'],
    web_accessible_resources: [
      {
        resources: ['report.html', 'assets/*'],
        matches: ['http://127.0.0.1/*'],
      },
    ],
  };
  await writeFile(
    'dist/test-extension/manifest.json',
    JSON.stringify(testManifest, null, 2),
  );
  const assetFiles = await readdir(`${output}/assets`);
  for (const file of [
    'capture.js',
    'background.js',
    ...assetFiles
      .filter((file) => file.endsWith('.js'))
      .map((file) => `assets/${file}`),
  ]) {
    const code = await readFile(`${output}/${file}`, 'utf8');
    if (/\beval\s*\(|new\s+Function\s*\(/.test(code))
      throw new Error(`MV3 audit failed: ${file}`);
  }
}

if (process.argv[1]?.endsWith('build.ts')) await buildExtension();
