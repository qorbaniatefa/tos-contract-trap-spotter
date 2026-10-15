import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { hashText } from '../src/analysis/snapshot';

const sources = [
  {
    id: 'spotify',
    url: 'https://www.spotify.com/us/legal/paid-subscription-terms/',
    language: 'en',
    kind: 'subscription',
  },
  {
    id: 'google',
    url: 'https://policies.google.com/privacy?hl=tr',
    language: 'tr',
    kind: 'privacy',
  },
  {
    id: 'mozilla',
    url: 'https://www.mozilla.org/en-US/about/legal/terms/firefox/',
    language: 'en',
    kind: 'tos',
  },
  {
    id: 'dropbox',
    url: 'https://www.dropbox.com/terms',
    language: 'en',
    kind: 'tos',
  },
  {
    id: 'github',
    url: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service',
    language: 'en',
    kind: 'tos',
  },
];
await mkdir('eval/sources', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const source of sources) {
    if (existsSync(`eval/sources/${source.id}.txt`)) continue;
    const page = await browser.newPage();
    try {
      let capturedUrl = source.url;
      try {
        const response = await page.goto(source.url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
        capturedUrl = page.url();
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes('ERR_CERT_AUTHORITY_INVALID')
        )
          throw error;
        // Node uses its normal CA trust store. Do not disable TLS verification.
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        await page.route('**/*', (route) => route.abort());
        await page.setContent(
          html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''),
          { waitUntil: 'domcontentloaded' },
        );
      }
      const target = page.locator('main').first();
      const text = await (
        (await target.count()) ? target : page.locator('body')
      ).innerText();
      if (text.length < 3000 || text.length > 200000)
        throw new Error(`Unexpected text length: ${text.length}`);
      await writeFile(`eval/sources/${source.id}.txt`, text);
      await writeFile(
        `eval/sources/${source.id}.json`,
        JSON.stringify(
          {
            ...source,
            retrievedAt: new Date().toISOString(),
            capturedUrl,
            hash: await hashText(text),
            scope: 'rendered main text; linked documents excluded',
            effectiveDate: 'See original text; dates are not inferred',
            characters: text.length,
          },
          null,
          2,
        ) + '\n',
      );
      console.log(`${source.id}: ${text.length} characters saved`);
    } catch (error) {
      console.error(
        `${source.id}: ${error instanceof Error ? error.message : 'failed'}`,
      );
      process.exitCode = 1;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
