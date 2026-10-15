import { defineConfig } from 'cypress';
import { resolve } from 'node:path';
import { bridgeTasks, setPort } from './scripts/browser-bridge';
import { chromium } from 'playwright';

export default defineConfig({
  video: true,
  viewportWidth: 1280,
  viewportHeight: 900,
  videosFolder: 'artifacts/videos',
  screenshotsFolder: 'artifacts/screenshots',
  e2e: {
    baseUrl: 'http://127.0.0.1:4319',
    supportFile: false,
    specPattern: 'cypress/e2e/**/*.cy.cjs',
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser, options) => {
        if (browser.family !== 'chromium')
          throw new Error('Chrome for Testing/Chromium is required');
        options.extensions.push(resolve('dist/test-extension'));
        const portArg = options.args.find((arg) =>
          arg.startsWith('--remote-debugging-port='),
        );
        if (portArg) setPort(Number(portArg.split('=')[1]));
        else options.args.push('--remote-debugging-port=9223');
        return options;
      });
      on('task', bridgeTasks);
      config.browsers = [
        {
          name: 'chromium',
          family: 'chromium',
          channel: 'stable',
          displayName: 'Chrome for Testing',
          version: '156.0.8078.4',
          majorVersion: 156,
          path: chromium.executablePath(),
        },
      ];
      return config;
    },
  },
});
