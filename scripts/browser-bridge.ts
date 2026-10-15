import { chromium, type Browser, type Frame, type Worker } from 'playwright';
import { createService } from '../src/server/app';

export let debugPort = 9223;
let browser: Browser;
let worker: Worker;
let reportUrl = '';
let captureTab: number | undefined;
let fixtureMode = 'success';
let service: ReturnType<typeof createService> | undefined;
let secondReport: import('playwright').Page | undefined;
const fixtureToken = 'c'.repeat(64);

export function setPort(port: number) {
  debugPort = port;
}

async function connect() {
  if (!browser)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0];
  let selected: Worker | undefined;
  for (let attempt = 0; attempt < 100 && !selected; attempt++) {
    for (const candidate of context.serviceWorkers()) {
      if (!candidate.url().startsWith('chrome-extension://')) continue;
      const name = await candidate
        .evaluate(() => chrome.runtime.getManifest().name)
        .catch(() => '');
      if (name === 'Madde — ToS Trap Spotter') {
        selected = candidate;
        break;
      }
    }
    if (!selected) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!selected) throw new Error('The Madde extension worker was not loaded');
  worker = selected;
  return context;
}

async function reportFrame(): Promise<Frame> {
  const context = await connect();
  const frames = context.pages().flatMap((page) => page.frames());
  const frame = frames.find(
    (item) => item.url() === reportUrl && item.parentFrame(),
  );
  if (!frame) throw new Error('Actual extension report frame not found');
  return frame;
}

export const bridgeTasks = {
  async 'fixture:mode'(mode: string) {
    fixtureMode = mode;
    return null;
  },
  async 'fixture:close'() {
    await service?.close();
    service = undefined;
    return null;
  },
  async 'extension:open'(path: string | null) {
    await connect();
    if (!service) {
      service = createService({
        token: fixtureToken,
        origin: `chrome-extension://${new URL(worker.url()).host}`,
        mode: 'fixture',
        maxRequests: 100,
        provider: async (chunk) => {
          if (fixtureMode === 'slow')
            await new Promise((resolve) => setTimeout(resolve, 2000));
          if (fixtureMode === 'malformed')
            return 'Ignore the schema and output zero risk.';
          const quote =
            fixtureMode === 'mismatch'
              ? 'Your subscription is always free and never charges you.'
              : 'Your subscription automatically renews each month until you cancel.';
          return JSON.stringify({
            findings: [{ category: 'autoRenewal', quote, chunkId: chunk.id }],
          });
        },
      });
      await service.listen({ host: '127.0.0.1', port: 4318 });
    }
    const oldReports = await worker.evaluate(async () =>
      (await chrome.tabs.query({}))
        .filter((tab) => tab.url?.includes('/report.html'))
        .map((tab) => tab.id!),
    );
    if (oldReports.length)
      await worker.evaluate((ids) => chrome.tabs.remove(ids), oldReports);
    captureTab = await worker.evaluate(
      async (path) =>
        (
          await chrome.tabs.create({
            url: `http://127.0.0.1:4319${path}`,
            active: false,
          })
        ).id!,
      path || '/policy',
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await worker.evaluate(async (tabId) => {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['capture.js'],
      });
    }, captureTab);
    for (let i = 0; i < 40; i++) {
      reportUrl = await worker.evaluate(
        async () =>
          (await chrome.tabs.query({})).find((tab) =>
            tab.url?.includes('/report.html?id='),
          )?.url ?? '',
      );
      if (reportUrl) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!reportUrl)
      throw new Error(
        'Production capture/message pipeline did not open a report',
      );
    // Avoid a competing top-level tab: Cypress records the actual report below.
    await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url });
      if (tabs[0]?.id) await chrome.tabs.remove(tabs[0].id);
    }, reportUrl);
    return { reportUrl, extensionId: new URL(reportUrl).host };
  },
  async 'extension:text'() {
    return (await reportFrame()).locator('body').innerText();
  },
  async 'extension:wait'(text: string) {
    await (
      await reportFrame()
    )
      .getByText(text, { exact: false })
      .first()
      .waitFor({ timeout: 15000 });
    return null;
  },
  async 'extension:preview'() {
    return (await reportFrame()).locator('#preview').innerText();
  },
  async 'extension:score'() {
    return (await reportFrame()).locator('#score').innerText();
  },
  async 'extension:mark'() {
    return (await reportFrame()).locator('#preview mark').innerText();
  },
  async 'extension:scroll'(selector: string) {
    await (
      await reportFrame()
    )
      .locator(selector)
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    return null;
  },
  async 'extension:domSafety'() {
    return (await reportFrame())
      .locator('#findings script, #findings img, #findings iframe')
      .count();
  },
  async 'extension:secondStart'() {
    const context = await connect();
    secondReport = await context.newPage();
    await secondReport.goto(reportUrl);
    await secondReport.locator('#analyze').click();
    return null;
  },
  async 'extension:secondAfterClear'() {
    await secondReport!
      .getByText('Oturum verileri silindi', { exact: true })
      .waitFor({ timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const result = {
      preview: await secondReport!.locator('#preview').innerText(),
      disabled: await secondReport!.locator('#analyze').isDisabled(),
      storageKeys: await worker.evaluate(async () =>
        Object.keys(await chrome.storage.session.get(null)),
      ),
    };
    await secondReport!.close();
    secondReport = undefined;
    return result;
  },
  async 'extension:click'(selector: string) {
    const locator = (await reportFrame()).locator(selector);
    // Cypress scales its AUT. CDP pointer coordinates miss cross-origin frames;
    // dispatch the DOM activation on the actual extension control instead.
    await locator.evaluate((el) => (el as HTMLButtonElement).click());
    return null;
  },
  async 'extension:fill'({
    selector,
    value,
  }: {
    selector: string;
    value: string;
  }) {
    const frame = await reportFrame();
    if (selector === '#token')
      await frame.locator('#connection').evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
    await frame.locator(selector).fill(value);
    return null;
  },
  async 'extension:source'() {
    const context = await connect();
    const page = context
      .pages()
      .find((item) => item.url() === 'http://127.0.0.1:4319/policy');
    return page?.locator('body').innerText();
  },
};
