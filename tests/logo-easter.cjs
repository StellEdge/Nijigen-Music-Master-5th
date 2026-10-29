const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}), errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('file:///' + path.resolve(__dirname,'../index.html').replace(/\\/g,'/'));
  await page.waitForFunction(()=>!document.body.classList.contains('app-loading'));
  await page.locator('#warmup').evaluate(button=>{window.easterWarmClicks=0;button.addEventListener('click',()=>window.easterWarmClicks++);});
  const tap = async n => {for(let i=0;i<n;i++)await page.locator('.brand').tap();};
  await tap(4); assert.equal(await page.locator('#logoBubble').isHidden(),true);
  await tap(1); assert.equal(await page.locator('#logoBubble').innerText(),'你也渴望王之力吗');
  await tap(5); assert.equal(await page.locator('#logoBubble').innerText(),'你也渴望王之力吗'); // Cooldown clicks do not count.
  await page.waitForTimeout(2100); await tap(5);
  assert.equal(await page.locator('#logoBubble').innerText(),'最好用的歌牌播放器 BY 星刃');
  await page.waitForTimeout(2100); await tap(5);
  assert.equal(await page.locator('#logoBubble').innerText(),'最好的二次元之旅，感谢有你');
  await page.waitForFunction(()=>document.querySelector('#state').textContent==='热场播放'&&document.querySelector('#duration').textContent!=='00:00');
  assert.equal(await page.evaluate(()=>window.easterWarmClicks),1);
  assert.equal(await page.evaluate(()=>location.hash),'');
  await page.waitForTimeout(2100); await tap(5);
  assert.equal(await page.locator('#logoBubble').innerText(),'你也渴望王之力吗');
  await page.waitForTimeout(12100); await tap(5);
  assert.equal(await page.locator('#logoBubble').innerText(),'你也渴望王之力吗'); // Expired chain restarts at the first phrase.
  await page.waitForTimeout(2100); await tap(3); await page.waitForTimeout(1100); await tap(2);
  assert.equal(await page.locator('#logoBubble').isHidden(),true); // Slow, disconnected clicks do not trigger.
  await tap(3); assert.equal(await page.locator('#logoBubble').innerText(),'最好用的歌牌播放器 BY 星刃');
  assert.deepEqual(errors,[]);
  console.log('PASS: five-tap threshold, cooldown ignores taps, three phrases, warmup button/playback, timeout reset, non-consecutive reset, no hash navigation or page errors');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
