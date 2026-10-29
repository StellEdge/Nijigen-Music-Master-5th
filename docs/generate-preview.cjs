const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
(async () => {
  execFileSync(process.env.PYTHON || 'python', [path.join(__dirname, 'generate-demo-pack.py')]);
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.locator('#zipInput').setInputFiles(path.join(root, 'output/readme-demo.zip'));
    await page.waitForFunction(() => document.querySelectorAll('.song').length === 1);
    await page.locator('#playlistButton').click();
    await page.locator('.song button').click();
    await page.waitForFunction(() => document.querySelector('#state').textContent === '正在播放');
    await page.waitForFunction(() => {
      const img = document.querySelector('#cover');
      return !img.hidden && img.complete && img.naturalWidth > 0;
    });
    await page.locator('#play').click();
    await page.locator('#seek').evaluate(el => {
      el.value = '45';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => document.fonts.ready);
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Layout overflow');
      await page.screenshot({ path: path.join(__dirname, `screenshots/preview-${name}.png`) });
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('README desktop and mobile screenshots generated with supplied cover and synthetic audio.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
