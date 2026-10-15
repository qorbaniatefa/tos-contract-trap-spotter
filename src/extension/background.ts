import type { Snapshot } from '../analysis/snapshot';

void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  void chrome.scripting
    .executeScript({ target: { tabId: tab.id }, files: ['capture.js'] })
    .catch(async () => {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('report.html?error=restricted'),
      });
    });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0)
    return;
  const data = message as { type?: string; snapshot?: Snapshot };
  if (data.type === 'captureFailed') {
    void chrome.tabs.create({
      url: chrome.runtime.getURL('report.html?error=capture'),
    });
    return;
  }
  if (
    data.type !== 'captureReady' ||
    !data.snapshot ||
    typeof data.snapshot.text !== 'string' ||
    data.snapshot.text.length > 200000
  )
    return;
  const id = crypto.randomUUID();
  void chrome.storage.session
    .set({ [`capture:${id}`]: data.snapshot })
    .then(async () => {
      await chrome.tabs.create({
        url: chrome.runtime.getURL(`report.html?id=${id}`),
      });
      respond({ ok: true });
    });
  return true;
});
