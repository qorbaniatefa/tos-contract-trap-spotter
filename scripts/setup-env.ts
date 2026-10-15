import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

if (existsSync('.env')) {
  const current = await readFile('.env', 'utf8');
  const additions = [];
  if (!/^GEMINI_API_KEY=/m.test(current)) additions.push('GEMINI_API_KEY=');
  if (!/^GEMINI_MODEL=/m.test(current))
    additions.push('GEMINI_MODEL=gemini-3.5-flash-lite');
  if (additions.length)
    await writeFile('.env', current + '\n' + additions.join('\n') + '\n');
  console.log(
    '.env is ready for Gemini. Existing values were preserved. Enter GEMINI_API_KEY locally, never in chat.',
  );
} else {
  const template = await readFile('.env.example', 'utf8');
  await writeFile(
    '.env',
    template.replace(
      /^PAIRING_TOKEN=$/m,
      `PAIRING_TOKEN=${randomBytes(32).toString('hex')}`,
    ),
    { flag: 'wx' },
  );
  console.log(
    'Created ignored .env with a random pairing token. Enter LLM_API_KEY locally and set the provider/model and extension origin.',
  );
}
