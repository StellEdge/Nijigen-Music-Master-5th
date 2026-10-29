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
   window.testSavedPack = good; window.nativeUpdates = []; window.AndroidPlayback = {update:json => window.nativeUpdates.push(JSON.parse(json))};
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
  assert.equal(await page.evaluate(() => window.nativeUpdates.at(-1).active),false);
  const command = name => page.evaluate(name => window.dispatchEvent(new CustomEvent('karuta-native-command',{detail:name})),name);
  const active = value => page.waitForFunction(value => window.nativeUpdates.at(-1).active === value,value);
  const heartbeat = setInterval(() => page.evaluate(() => window.karutaNativeHeartbeat()).catch(() => {}),100);
  try {
   await page.locator('#play').click(); await active(true);
   await page.waitForFunction(() => document.querySelector('#state').textContent === '正在播放');
   await page.evaluate(() => window.dispatchEvent(new CustomEvent('karuta-native-visibility',{detail:true})));
   const before = await page.evaluate(() => window.nativeUpdates.at(-1).position);
   await page.waitForFunction(before => window.nativeUpdates.at(-1).position > before + .3,before);
   await command('pause'); await active(false);
   await command('play'); await active(true);
   await command('next'); await page.waitForFunction(() => document.querySelector('#state').textContent === '正在播放');
   await command('stop'); await active(false);
   assert.equal(await page.evaluate(() => window.nativeUpdates.at(-1).available),false);
   await page.evaluate(() => window.dispatchEvent(new CustomEvent('karuta-native-visibility',{detail:false})));
   await page.locator('#warmup').click(); await active(true);
   await command('pause'); await active(false);
   await command('play'); await active(true);
   await command('stop'); await active(false);
   await page.evaluate(() => { document.querySelector('#length').value = '.6'; document.querySelector('#gap').value = '.2'; document.querySelector('#loop').checked = false; });
   await page.locator('#newRound').click(); await active(true);
   await page.waitForFunction(() => document.querySelector('#state').textContent === '本轮结束');
   await active(false);
   assert.deepEqual(errors,[]);
   console.log('PASS native bridge: idle restore, background progress, pause/resume, next, stop, warmup, timed game completion');
  } finally { clearInterval(heartbeat); }
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
