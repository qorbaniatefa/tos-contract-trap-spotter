import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export async function verifyDemoDuration() {
  // Playwright's minimal FFmpeg cannot demux MP4. Verify the actual artifact
  // with the same browser family that records and presents the demonstration.
  const videoUrl = pathToFileURL(
    resolve('artifacts/videos/demo.cy.cjs.mp4'),
  ).href;
  const browser = await chromium.launch({ headless: true });
  let seconds: number;
  try {
    const page = await browser.newPage();
    await page.goto(videoUrl);
    seconds = await page.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video) throw new Error('Recorded video could not be opened');
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 1) return resolve();
        video.addEventListener('loadedmetadata', () => resolve(), {
          once: true,
        });
        video.addEventListener(
          'error',
          () => reject(new Error('Invalid MP4')),
          {
            once: true,
          },
        );
        setTimeout(() => reject(new Error('Video metadata timed out')), 10000);
      });
      return video.duration;
    });
  } finally {
    await browser.close();
  }
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error('Could not verify the recorded video duration');
  await writeFile(
    'artifacts/video-verification.json',
    JSON.stringify(
      {
        file: 'artifacts/videos/demo.cy.cjs.mp4',
        seconds,
        maximumSeconds: 90,
        passed: seconds <= 90,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Recorded demo video: ${seconds.toFixed(2)} seconds (maximum 90).`,
  );
  if (seconds > 90) throw new Error('The recorded demo exceeds 90 seconds');
}
