// Integration test of the native saved-URI bridge using range-served ZIP contents.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const context = await browser.newContext({viewport:{width:390,height:844}}), page = await context.newPage();
  const zip = fs.readFileSync(path.resolve(__dirname,'fixtures/native-reopen.zip')), ranges = [], errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.addInitScript(size => {
   const good = {id:'saved-test',name:'测试歌包.zip',size,url:'https://appassets.androidplatform.net/imports/saved-test'};
   if(!localStorage.getItem('test.savedUris')) localStorage.setItem('test.savedUris',JSON.stringify([{id:'missing',error:'曲包已移动，请重新选择'},good]));
   window.testSavedPack = good;
   window.AndroidFiles = {
    listPacks:() => localStorage.getItem('test.savedUris'),
    forgetPack:id => localStorage.setItem('test.savedUris',JSON.stringify(JSON.parse(localStorage.getItem('test.savedUris')).filter(pack => pack.id !== id)))
   };
  },zip.length);
  await page.route('**/*',route => {
   const url = new URL(route.request().url());
   if(url.pathname === '/imports/saved-test') {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d+)$/);
    assert.ok(range,'native ZIP fetches must request explicit ranges');
    const begin = Number(range[1]), end = Number(range[2]); ranges.push([begin,end]);
    return route.fulfill({status:206,contentType:'application/zip',headers:{'Content-Range':`bytes ${begin}-${end}/${zip.length}`},body:zip.subarray(begin,end + 1)});
   }
   const base = path.resolve(__dirname,'..'), file = path.resolve(base,decodeURIComponent(url.pathname).replace(/^\/player\//,''));
   if(url.hostname !== 'appassets.androidplatform.net' || !file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:''});
   const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.mp3':'audio/mpeg'}[path.extname(file)] || 'application/octet-stream';
   return route.fulfill({status:200,contentType:mime,body:fs.readFileSync(file)});
  });
  await page.goto('https://appassets.androidplatform.net/player/index.html');
  await page.waitForFunction(() => document.querySelector('#total').textContent === '2 首');
  assert.equal(await page.locator('#issueCount').textContent(),'1'); // Missing references do not block valid archives.
  assert.ok(ranges[0][0] > 0 && ranges.every(([a,b]) => b - a + 1 < zip.length));
  await page.locator('#play').click(); await page.waitForFunction(() => document.querySelector('#state').textContent === '正在播放');
  await page.setViewportSize({width:667,height:375});
  await page.waitForFunction(() => {
   const canvas = document.querySelector('#spectrum'), top = Number(canvas.dataset.bandTop), bottom = Number(canvas.dataset.bandBottom);
   const row = Math.floor((top + bottom) / 2 * canvas.height / innerHeight);
   return bottom - top >= innerHeight * .15 && canvas.getContext('2d').getImageData(0,row,canvas.width,1).data.some((value,i) => i % 4 === 3 && value > 0);
  });
  assert.ok(await page.locator('#spectrum').evaluate(el => Math.abs(Number(el.dataset.bandTop) / innerHeight - .67) < .001));
  await page.setViewportSize({width:390,height:844});
  await page.locator('#play').click();
  assert.ok(await page.evaluate(() => getComputedStyle(document.body,'::after').backgroundImage.includes('233, 243, 250')));
  await page.reload(); await page.waitForFunction(() => document.querySelector('#total').textContent === '2 首');
  await page.evaluate(() => window.karutaImportNativePacks()); assert.equal(await page.locator('#total').textContent(),'2 首');
  await page.locator('#importButton').click(); await page.locator('.pack button').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test.savedUris')).some(pack => pack.id === 'saved-test')),false);
  await page.reload(); await page.waitForTimeout(200); assert.equal(await page.locator('#total').textContent(),'0 首');
  await page.evaluate(() => { localStorage.setItem('test.savedUris',JSON.stringify([window.testSavedPack])); return window.karutaImportNativePacks(['saved-test'],true); });
  await page.waitForFunction(() => document.querySelector('#total').textContent === '2 首');
  assert.deepEqual(errors,[]);
  console.log('PASS: automatic restore, lazy byte ranges, ZIP audio playback, missing-reference isolation, no duplicate restore, forgetting removed packs, explicit reimport, top gradient');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
