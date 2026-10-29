const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1106,height:873}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto('file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/'));
  await page.evaluate(()=>{
   const wav=new ArrayBuffer(44+32000*20),v=new DataView(wav);
   const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
   str(0,'RIFF');v.setUint32(4,wav.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,wav.byteLength-44,true);
   const svg=(w,h)=>new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="skyblue"/></svg>`],{type:'image/svg+xml'});
   const blobs={'data.csv':new Blob(['title,music,image\nPortrait,t.wav,p.svg\nLandscape,t.wav,l.svg\nMissing,t.wav,\nBroken,t.wav,b.svg']), 't.wav':new Blob([wav],{type:'audio/wav'}),'p.svg':svg(600,900),'l.svg':svg(900,600),'b.svg':new Blob(['broken'],{type:'image/svg+xml'})};
   KarutaZip.readZip=async()=>new Map(Object.entries(blobs).map(([k,b])=>[k,{getBlob:async()=>b}]));
   const decode=Image.prototype.decode;
   Image.prototype.decode=async function(){if(window.holdDecode)await new Promise(r=>window.releaseDecode=r);return decode.call(this);};
   window.badRatios=[];window.cropChanges=[];
   const monitor=()=>{const c=document.querySelector('#card'),i=document.querySelector('#cover');if(c.style.visibility!=='hidden'&&!i.hidden&&i.naturalWidth){const r=parseFloat(getComputedStyle(c).getPropertyValue('--card-ratio'));if(Math.abs(r-i.naturalWidth/i.naturalHeight)>.01)window.badRatios.push(r);}requestAnimationFrame(monitor);};monitor();
  });
  await page.locator('#zipInput').setInputFiles({name:'cards.zip',mimeType:'application/zip',buffer:Buffer.from('fixture')});
  await page.waitForFunction(()=>document.querySelector('#total').textContent==='4 首');
  const select=async title=>{await page.evaluate(t=>{
   const card=document.querySelector('#card');
   const props=['width','height','display','object-fit','object-position','border-radius','box-sizing'];
   const face=el=>[el,...el.querySelectorAll('*')].map(node=>{const s=getComputedStyle(node);return props.map(p=>s.getPropertyValue(p));});
   const before=face(card),count=document.querySelectorAll('.outgoing-card').length;
   [...document.querySelectorAll('.song button')].find(b=>b.querySelector('strong').textContent===t).click();
   const outgoing=[...document.querySelectorAll('.outgoing-card')];
   if(outgoing.length>count){const after=face(outgoing.at(-1));if(before.some((row,i)=>row.some((v,j)=>v!==after[i][j] && !(j<2 && v.endsWith('px') && after[i][j].endsWith('px') && Math.abs(parseFloat(v)-parseFloat(after[i][j]))<.05))))window.cropChanges.push({before,after});}
  },title);await page.waitForFunction(()=>document.querySelector('#state').textContent==='正在播放');};
  const visible=()=>page.waitForFunction(()=>document.querySelector('#card').style.visibility!=='hidden');
  await select('Portrait');await visible();
  await page.evaluate(()=>window.holdDecode=true);
  await select('Landscape');
  assert.equal(await page.locator('#card').evaluate(e=>e.style.visibility),'hidden');
  await page.waitForFunction(()=>!!window.releaseDecode);
  await page.evaluate(()=>{window.holdDecode=false;window.releaseDecode();});await visible();
  assert.equal(await page.locator('#card').evaluate(e=>e.style.getPropertyValue('--card-ratio')),'1.5');
  await select('Portrait');await visible();
  await page.evaluate(()=>document.querySelector('.outgoing-card').dataset.preserved='yes');
  await select('Landscape');await visible();
  assert.equal(await page.locator('.outgoing-card[data-preserved=yes]').count(),1);
  assert.ok(await page.locator('.outgoing-card').count()>=2);
  await page.waitForFunction(()=>!document.querySelector('.outgoing-card'));
  await page.evaluate(()=>{window.holdDecode=true;window.releaseDecode=null;});
  await select('Portrait');await page.waitForFunction(()=>!!window.releaseDecode);
  await page.evaluate(()=>window.holdDecode=false);
  await select('Landscape');await visible();
  await page.evaluate(()=>window.releaseDecode());
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#card').evaluate(e=>e.style.getPropertyValue('--card-ratio')),'1.5');
  await select('Broken');await visible();assert.equal(await page.locator('#cardPlaceholder').isVisible(),true);
  await select('Missing');await visible();assert.equal(await page.locator('#cardPlaceholder').isVisible(),true);
  await select('Portrait');await visible();
  assert.deepEqual(await page.evaluate(()=>window.cropChanges),[]);
  assert.deepEqual(await page.evaluate(()=>window.badRatios),[]);assert.deepEqual(errors,[]);
  console.log('PASS: delayed landscape decode has no portrait flash; rapid transitions preserve outgoing cards; independent cleanup; corrupt/missing artwork fallback; no stale ratio frames or page errors.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
