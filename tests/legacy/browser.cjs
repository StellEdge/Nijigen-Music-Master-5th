const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page = await browser.newPage({viewport:{width:1440,height:900}}), errors = [];
 page.on('pageerror',e => errors.push(e.message));
 const waitState = text => page.waitForFunction(text => document.querySelector('#state').textContent === text,text);
 const playlist = async () => { if(await page.locator('#playlistPanel').isHidden()) await page.locator('#playlistButton').click(); };
 const select = async text => { await playlist(); await page.locator('#search').fill(text); await page.locator('.song button').first().click(); };
 const mode = async (id,on) => { if((await page.locator('#'+id).getAttribute('aria-pressed') === 'true') !== on) await page.locator('#'+id).click(); };
 try {
  await page.addInitScript(() => {
   window.roundedSpectrumBars = 0;
   const original = CanvasRenderingContext2D.prototype.roundRect;
   CanvasRenderingContext2D.prototype.roundRect = function(...args) { if(this.canvas.id === 'spectrum' && args[4] > 0) window.roundedSpectrumBars++; return original.apply(this,args); };
  });
  await page.goto('file:///' + path.resolve(__dirname,'../../index.html').replace(/\\/g,'/'));
  await page.waitForFunction(() => document.querySelector('.brand img').naturalWidth > 0);
  assert.equal(await page.locator('#replay,#stop,.brand-credit').count(),0);
  assert.equal(await page.locator('#warmup').getAttribute('aria-label'),'播放热场音乐');
  await page.locator('#folderInput').setInputFiles(path.resolve(__dirname,'../../../MusicData/Dark')); await page.waitForFunction(() => document.querySelector('#total').textContent === '50 首');
  await page.locator('#folderInput').setInputFiles(path.resolve(__dirname,'../../../MusicData/CoreSet')); await page.waitForFunction(() => document.querySelector('#total').textContent === '52 首');
  await playlist();
  const corePack = page.getByRole('checkbox',{name:'选择歌包 CoreSet',exact:true});
  const darkPack = page.getByRole('checkbox',{name:'选择歌包 Dark',exact:true});
  await corePack.uncheck(); assert.equal(await page.locator('.song>input:checked').count(),50);
  await page.locator('.song').filter({hasText:'鳥の詩'}).locator('input').check();
  assert.equal(await corePack.evaluate(el => el.indeterminate),true);
  await corePack.check(); assert.equal(await page.locator('.song>input:checked').count(),52);
  await darkPack.uncheck(); assert.equal(await page.locator('.song>input:checked').count(),2);
  await darkPack.check(); assert.equal(await page.locator('.song>input:checked').count(),52);
  await select('鳥の詩'); await waitState('正在播放');
  await page.waitForFunction(() => !document.querySelector('#cover').hidden && document.querySelector('#cover').naturalWidth > 0);
  await page.waitForFunction(() => {
   const c = document.querySelector('#spectrum');
   return c.classList.contains('live') && c.getContext('2d').getImageData(0,Math.floor((Number(c.dataset.bandTop) + Number(c.dataset.bandBottom)) / 2 * c.height / innerHeight),c.width,1).data.some((v,i) => i % 4 === 3 && v > 0);
  });
  assert.ok(await page.evaluate(() => window.roundedSpectrumBars > 0));
  assert.equal(await page.locator('#state').evaluate(el => getComputedStyle(el).clipPath),'inset(50%)');
  for(const id of ['importButton','playlistButton','settingsButton','newRound','warmup','shuffleShortcut','autoShortcut','limitShortcut','reveal']) {
   assert.equal(await page.locator('#'+id+' svg').count(),1);
   assert.equal((await page.locator('#'+id).innerText()).trim(),'');
   assert.ok(await page.locator('#'+id).getAttribute('aria-label'));
  }
  await page.locator('#closePlaylist').isVisible().then(async visible => { if(visible) await page.locator('#closePlaylist').click(); });
  await page.waitForFunction(() => !document.querySelector('#card').getAnimations().some(a => a.effect.getTiming().iterations !== Infinity));
  await page.screenshot({path:path.resolve(__dirname,'../../preview-spectrum.png')});
  assert.equal(await page.locator('#newRound').getAttribute('aria-label'),'开一局');
  assert.ok((await page.locator('#duration').innerText()) > '00:30');
  await page.locator('#play').click(); await waitState('已暂停');
  await page.waitForFunction(() => !document.querySelector('#spectrum').classList.contains('live'));
  await page.locator('#play').click(); await waitState('正在播放');
  await select('Crossing field'); await waitState('正在播放');
  await select('鳥の詩'); await waitState('正在播放'); await page.locator('#play').click();
  if(await page.locator('#playlistPanel').isVisible()) await page.locator('#closePlaylist').click();
  await page.waitForFunction(() => !document.querySelector('#card').getAnimations().some(a => a.effect.getTiming().iterations !== Infinity) && !document.querySelector('.outgoing-card'));
  await page.screenshot({path:path.resolve(__dirname,'../../preview-desktop.png')});
  await page.locator('#importButton').click();
  while(await page.locator('.pack').count()) await page.locator('.pack button').first().click();
  await page.locator('#zipInput').setInputFiles(path.resolve(__dirname,'fixtures/test.zip')); await page.waitForFunction(() => document.querySelector('#total').textContent === '2 首');
  await mode('shuffleShortcut',false); await mode('reveal',true); await mode('limitShortcut',true); await mode('autoShortcut',true);
  await page.locator('#settingsButton').click(); await page.locator('#length').fill('0.6'); await page.locator('#gap').fill('0.4'); await page.locator('#offset').fill('2'); await page.locator('#randomStart').check(); await page.locator('#closeSettings').click();
  // Non-game playback must ignore all game rules and play the full track openly.
  await page.locator('#play').click(); await waitState('正在播放');
  assert.equal(await page.locator('#title').innerText(),'测试一');
  assert.equal(await page.locator('#duration').innerText(),'00:05');
  await page.waitForTimeout(1000); await waitState('正在播放');
  assert.equal(await page.locator('#title').innerText(),'测试一');
  assert.equal(await page.locator('#gamePanel').getAttribute('class'),'game-panel');
  await page.locator('#next').click(); await waitState('正在播放'); assert.equal(await page.locator('#title').innerText(),'测试二');
  // A game uses a frozen queue and a visible red end toggle with animated perimeter.
  await page.locator('#newRound').click(); await waitState('正在读牌');
  assert.equal(await page.locator('#title').innerText(),'未揭晓');
  assert.equal(await page.locator('#newRound').getAttribute('aria-label'),'结束游戏');
  assert.equal(await page.locator('#newRound').evaluate(el=>el.classList.contains('end-game')),true);
  assert.equal(await page.locator('#gamePanel').evaluate(el=>getComputedStyle(el,'::before').animationName),'game-border-flow');
  await mode('shuffleShortcut',true); // Does not reorder this game's second song.
  await waitState('牌间等待'); assert.equal(await page.locator('#title').innerText(),'测试一');
  await page.locator('#play').click(); await waitState('已暂停'); await page.waitForTimeout(600); await waitState('已暂停');
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#title').textContent === '测试二' && document.querySelector('#state').textContent === '牌间等待');
  await waitState('本轮结束'); assert.equal(await page.locator('#newRound').getAttribute('aria-label'),'开一局');
  assert.equal(await page.locator('#history li').count(),2);
  // End during loading is supported; ordinary playback afterward is a full track.
  await page.locator('#newRound').click(); await page.locator('#newRound').click(); await waitState('准备就绪');
  assert.notEqual(await page.locator('#title').innerText(),'未揭晓');
  await page.locator('#play').click(); await waitState('正在播放');
  await page.waitForTimeout(900); await waitState('正在播放');
  // Shared volume, independent warmup, and no game activation from ordinary playback.
  const wav=Buffer.alloc(44+16000*5); wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
  await page.locator('#warmupInput').setInputFiles({name:'热场.wav',mimeType:'audio/wav',buffer:wav}); await waitState('热场播放');
  assert.equal(await page.locator('#newRound').getAttribute('aria-label'),'开一局');
  await page.locator('#warmup').click(); await waitState('已暂停');
  await page.locator('#play').click(); await waitState('正在播放'); await page.locator('#play').click();
  // Viewport, orientation, and explicit simulated safe-area checks.
  for(const viewport of [{width:1440,height:900},{width:1024,height:600},{width:800,height:450},{width:390,height:844},{width:375,height:667},{width:320,height:568},{width:844,height:390},{width:667,height:375}]) {
   await page.setViewportSize(viewport);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth),false,JSON.stringify(viewport));
   await page.waitForTimeout(40);
   const band = await page.locator('#spectrum').evaluate(el => ({top:Number(el.dataset.bandTop),bottom:Number(el.dataset.bandBottom)}));
   if(viewport.width > viewport.height) {
    const dock = await page.locator('.playback-dock').boundingBox();
    assert.ok(Math.abs(band.top / viewport.height - .67) < .001 && Math.abs(band.bottom / viewport.height - .83) < .001,'landscape spectrum fixed in lower background band');
    assert.ok(band.bottom - band.top <= viewport.height * .16 + 1,'bounded landscape spectrum height');
   } else {
    const info = await page.locator('.song-info').boundingBox();
    assert.ok(band.bottom <= info.y - 7 && band.bottom - band.top <= viewport.height * .09 + 1,'portrait spectrum above metadata');
   }
   const logo = await page.locator('.brand').boundingBox(), actions = await page.locator('.header-actions').boundingBox();
   assert.ok(actions.y < 25,'header actions stay at top');
   assert.ok(logo.x + logo.width <= actions.x,'header logo and actions never overlap');
   for(const id of ['play','newRound','previous','next','warmup','volume','importButton','playlistButton','settingsButton']) {
    const r=await page.locator('#'+id).boundingBox(); assert.ok(r&&r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width&&r.y+r.height<=viewport.height,id+' clipped '+JSON.stringify(viewport));
   }
   const circles = await page.locator('.mode-controls>button').evaluateAll(buttons => buttons.map(button => {const r=button.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
   assert.equal(circles.length,6);
   for(let i=0;i<6;i++) { assert.ok(Math.abs(circles[i].width-circles[i].height)<1,'circular control'); if(i) assert.ok(circles[i].x>circles[i-1].x,'one row'); if(i) assert.ok(Math.abs(circles[i].y-circles[0].y)<1,'aligned circular controls'); }
   if(viewport.width>viewport.height) {
    const c=await page.locator('.card-area').boundingBox(), g=await page.locator('#gamePanel').boundingBox(); assert.ok(c.x+c.width<=g.x+2,'landscape must be side by side');
   }
   await page.locator('#playlistButton').click(); assert.equal(await page.locator('#playlistPanel').isVisible(),true);
   await page.locator('#importButton').click(); assert.equal(await page.locator('#playlistPanel').isHidden(),true); await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>{ for(const [key,v] of Object.entries({'--safe-left':'34px','--safe-right':'34px','--safe-bottom':'18px'}))document.documentElement.style.setProperty(key,v); });
  for(const id of ['play','newRound','warmup','volume','importButton']) { const r=await page.locator('#'+id).boundingBox(); assert.ok(r.x>=34&&r.x+r.width<=810&&r.y+r.height<=372,id+' safe area'); }
  await page.screenshot({path:path.resolve(__dirname,'../../preview-landscape.png')});
  await page.evaluate(()=>document.documentElement.removeAttribute('style')); await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.resolve(__dirname,'../../preview-mobile.png')});
  await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForFunction(()=>![...document.querySelectorAll('.ambient i')].some(el=>el.getAnimations().length));
  assert.deepEqual(errors,[]);
  console.log('PASS: normal full-track playback, game toggle/red end/flow border, frozen queue, reveal/gap/pause, loading cancellation, warmup, 8 viewports, landscape split, safe areas, no page errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
