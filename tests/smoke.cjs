const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

test('standalone ZIP import, playback, pause and mobile layout', async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const NativeAudio = window.Audio;
      window.testAudio = [];
      window.Audio = function (...args) {
        const audio = new NativeAudio(...args);
        window.testAudio.push(audio);
        return audio;
      };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.locator('#zipInput').setInputFiles(path.resolve(__dirname, 'fixtures/test.zip'));
    await page.waitForFunction(() => document.querySelectorAll('.song').length > 0);
    await page.locator('#playlistButton').click();
    await page.locator('.song button').first().click();
    await page.waitForFunction(() => window.testAudio.some(a => !a.paused && a.currentTime > 0));
    await page.locator('#play').click();
    await page.waitForFunction(() => window.testAudio.every(a => a.paused));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
