const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const context = await browser.newContext({viewport:{width:667,height:375},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page = await context.newPage(), errors = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.goto('file:///' + path.resolve(__dirname,'../index.html').replace(/\\/g,'/'));
  await page.waitForFunction(() => !document.body.classList.contains('app-loading'));
  // Model a long song title without changing player state or loading audio.
  await page.locator('#title').evaluate(el => { el.textContent = '这是在特别窄的横屏窗口中也不应该遮挡右上角菜单按钮的很长很长的歌曲名称'; });
  for(const viewport of [{width:667,height:375},{width:568,height:320},{width:740,height:320},{width:844,height:390},{width:1024,height:600},{width:390,height:844},{width:320,height:568}]) {
   await page.setViewportSize(viewport); await page.waitForTimeout(50);
   const boxes = await page.evaluate(() => {
    const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    return {logo:rect('.brand'),actions:rect('.header-actions'),info:rect('.song-info'),dock:rect('.playback-dock'),seek:rect('#seek'),volume:rect('#volume'),volumeBox:rect('.dock-volume'),buttons:[...document.querySelectorAll('.mode-controls>button')].map(button=>{const b=button.getBoundingClientRect(),s=button.querySelector('svg').getBoundingClientRect();return {dx:Math.abs(b.x+b.width/2-s.x-s.width/2),dy:Math.abs(b.y+b.height/2-s.y-s.height/2)};})};
   });
   assert.ok(Math.abs(boxes.logo.height-boxes.actions.height)<1 && Math.abs(boxes.logo.y-boxes.actions.y)<1,'same-height header');
   assert.ok(boxes.logo.right < boxes.actions.x,'no header overlap');
   assert.ok(boxes.seek.x>=boxes.dock.x && boxes.seek.right<=boxes.dock.right-5,'seek inside dock');
   assert.ok(boxes.volume.x>=boxes.volumeBox.x-1 && boxes.volume.right<=boxes.volumeBox.right+1 && boxes.volume.right<=boxes.dock.right-5,'volume inside column');
   assert.ok(boxes.buttons.every(b=>b.dx<.6&&b.dy<.6),'centered mode icons');
   assert.ok(boxes.info.y>=boxes.actions.bottom+3,'song never overlaps navigation');
   if(viewport.width>viewport.height) assert.ok(boxes.dock.bottom>viewport.height-60,'landscape console near bottom');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth),false,'no viewport overflow');
  }
  await page.setViewportSize({width:390,height:844});
  const auto = page.locator('#autoShortcut'), tv = page.locator('#limitShortcut');
  const start = await auto.getAttribute('aria-pressed');
  await auto.tap(); await page.waitForTimeout(220);
  const first = await auto.evaluate(el=>({pressed:el.getAttribute('aria-pressed'),background:getComputedStyle(el).backgroundColor,focus:document.activeElement===el}));
  assert.notEqual(first.pressed,start); assert.equal(first.focus,false);
  await tv.tap(); await page.waitForTimeout(220);
  assert.equal(await auto.getAttribute('aria-pressed'),first.pressed);
  assert.equal(await auto.evaluate(el=>getComputedStyle(el).backgroundColor),first.background,'another tap must not change apparent state');
  await auto.tap(); await page.waitForTimeout(220);
  const second = await auto.evaluate(el=>({pressed:el.getAttribute('aria-pressed'),background:getComputedStyle(el).backgroundColor,focus:document.activeElement===el}));
  assert.equal(second.pressed,start); assert.notEqual(second.background,first.background); assert.equal(second.focus,false);
  await page.screenshot({path:path.resolve(__dirname,'../preview-mobile-controls.png')});
  await page.setViewportSize({width:667,height:375});
  await page.screenshot({path:path.resolve(__dirname,'../preview-short-landscape.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS: 7 viewports, aligned header/icons/sliders, long-title isolation, bottom-right landscape dock, real touch toggles/colors/focus, zero page errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
