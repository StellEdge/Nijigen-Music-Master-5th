const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const here = __dirname;
const esc = s => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1.5,reducedMotion:'reduce'});
  await page.goto('file:///'+path.resolve(here,'../index.html').replace(/\\/g,'/'));
  await page.waitForFunction(()=>!document.body.classList.contains('app-loading'));
  const ids=['newRound','warmup','shuffleShortcut','autoShortcut','limitShortcut','reveal','importButton','playlistButton','settingsButton'];
  const icons=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id).querySelector('svg').outerHTML])),ids);
  await page.evaluate(ids=>{
   const add=(n,x,y)=>{const badge=document.createElement('div');badge.textContent=String(n).padStart(2,'0');Object.assign(badge.style,{position:'fixed',left:Math.max(4,Math.min(innerWidth-32,x-14))+'px',top:Math.max(4,Math.min(innerHeight-32,y-14))+'px',width:'28px',height:'28px',borderRadius:'50%',display:'grid',placeItems:'center',background:'#314dc0',color:'#fff',border:'2px solid white',boxShadow:'0 2px 7px #334f7750',font:'bold 12px Segoe UI',zIndex:10000,pointerEvents:'none'});document.body.append(badge);};
   ids.forEach((id,i)=>{const r=document.getElementById(id).getBoundingClientRect();add(i+1,r.x+r.width/2,i<6?r.top-5:r.bottom+11);});
   for(const [number,selector,side] of [[10,'.transport','left'],[11,'#seek','left'],[12,'#volume','right']]){const r=document.querySelector(selector).getBoundingClientRect();add(number,side==='left'?r.left-8:r.right+9,r.y+r.height/2);}
  },ids);
  const screenshot=path.join(here,'guide-interface.png');
  await page.screenshot({path:screenshot});
  const card=(number,id,title,text)=>`<article class="feature"><div class="feature-top"><span class="number">${String(number).padStart(2,'0')}</span><div class="icon">${icons[id]}</div><h3>${title}</h3></div><p>${text}</p></article>`;
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>歌牌播放器 · 一图流使用说明</title><style>
  *{box-sizing:border-box}body{margin:0;color:#243653;font-family:"Segoe UI","Microsoft YaHei",sans-serif;background:#edf4fb}.sheet{width:1440px;padding:62px 70px 40px;background:radial-gradient(ellipse at 0 0,#d6f3ec88,transparent 50%),radial-gradient(ellipse at 100% 15%,#e1dcff70,transparent 45%),#f4f8fc}.eyebrow{font-size:15px;letter-spacing:3px;color:#768baa;margin:0 0 12px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}h1{font-size:46px;letter-spacing:1px;margin:0 0 12px;line-height:1.2}header p{font-size:21px;color:#6c7e98;margin:0}.header-badge{padding:12px 20px;border:1px solid #cfdcf2;border-radius:24px;color:#526cc2;background:#eef2ff;font-size:17px}.screen{border:1px solid #fff;border-radius:22px;overflow:hidden;box-shadow:0 14px 38px #4e6c9b20;background:#eaf2f9}.screen img{display:block;width:100%;height:auto}.workflow{display:flex;align-items:center;justify-content:center;gap:20px;padding:20px 15px;margin:24px 0 30px;border:1px solid #dce7f4;background:#ffffffb8;border-radius:16px;font-size:19px}.workflow b{font-size:16px;color:#647bd0;margin-right:8px}.arrow{color:#a3b2cb}h2{font-size:25px;margin:0 0 17px;display:flex;align-items:center;gap:12px}h2 small{font-weight:400;font-size:16px;color:#8796ab}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:30px}.feature{background:#ffffffc7;border:1px solid #e0e8f3;border-radius:16px;padding:20px 22px;min-height:146px}.feature-top{display:flex;align-items:center;gap:10px}.number{display:inline-grid;place-items:center;width:29px;height:29px;border-radius:50%;color:#fff;background:#425fc0;font-size:13px;font-weight:700;flex:none}.icon{display:grid;place-items:center;width:34px;height:34px;color:#6077c9;flex:none}.icon svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.7}h3{font-size:20px;margin:0;font-weight:650}.feature p{font-size:18px;line-height:1.7;color:#71819a;margin:12px 0 0}.ordinary{display:flex;gap:30px;align-items:center;padding:24px 28px;border:1px solid #d7e5e7;background:#e9f5efbb;border-radius:17px;margin-bottom:30px}.ordinary strong{font-size:21px;color:#407d6a;white-space:nowrap}.ordinary p{font-size:18px;margin:0;line-height:1.8;color:#5f7c78}.playback{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:16px}.playback .feature{min-height:112px}.playback .feature p{margin-top:9px;font-size:17px}.fine{display:flex;justify-content:space-between;gap:20px;font-size:14px;color:#90a0b6;margin-top:28px;padding-top:20px;border-top:1px solid #dce5f0}.note{font-size:15px;color:#8697b0;margin:-18px 0 28px}
  </style></head><body><main class="sheet"><p class="eyebrow">NIJIGEN MUSIC MASTER · 5TH ANNIVERSARY</p><header><div><h1>歌牌播放器 · 一图流使用说明</h1><p>先导入曲包，随时听歌；准备好后，开一局。</p></div><div class="header-badge">看图找按钮</div></header>
  <div class="screen"><img src="guide-interface.png" alt="播放器按钮位置，编号 01 至 12"></div>
  <div class="workflow"><span><b>07</b>加载 ZIP 曲包</span><span class="arrow">→</span><span><b>08</b>勾选歌包 / 曲目</span><span class="arrow">→</span><span><b>10</b>普通播放，或 <b>01</b>开一局</span></div>
  <h2>游戏控制 <small>六个圆形按钮，从左到右</small></h2><div class="grid">
  ${card(1,'newRound','开一局 / 结束','开始游戏后，按钮变红，边框流动高亮。<br>再次点击结束，回到普通播放。')}
  ${card(2,'warmup','热场音乐','播放默认或自选的热场音乐。<br>再次点击停止，不计入本局牌序。')}
  ${card(3,'shuffleShortcut','随机 / 顺序','选择新一局的出牌顺序。<br>游戏中切换，不改变本局牌序。')}
  ${card(4,'autoShortcut','全自动','按片段时长自动切到下一首。<br>默认每首 30 秒，随后进入牌间空歇。')}
  ${card(5,'limitShortcut','TVSize','开启随机起播时，起点限制在 0～80 秒。<br>它不是“播放 90 秒”的开关。')}
  ${card(6,'reveal','揭晓','开启后，游戏初段隐藏歌名与图片。<br>临近结尾和牌间空歇时才展示。')}
  </div><p class="note">蓝色选中表示开关已开启；悬停图标可查看名称。片段、间隔与随机起点可在设置中调整。</p>
  <h2>右上角菜单</h2><div class="grid">
  ${card(7,'importButton','加载曲包','选择 ZIP 歌包。Android 导入一次后，<br>下次启动自动恢复已授权的曲包。')}
  ${card(8,'playlistButton','播放列表','按整包或单首勾选游戏曲目。<br>未开局时，点歌即可播放整首。')}
  ${card(9,'settingsButton','读牌设置','设置片段时长、间隔与起播位置。<br>也可更换热场音乐、导出对局记录。')}
  </div>
  <div class="ordinary"><strong>两种使用方式</strong><p><b>未开局：</b>普通音乐播放器，播放整首，始终显示歌名和图片。<br><b>开局后：</b>应用游戏读牌规则；开局按钮变红，外框流动高亮。</p></div>
  <h2>播放控制</h2><div class="playback">
  <article class="feature"><div class="feature-top"><span class="number">10</span><h3>上一首 · 播放 / 暂停 · 下一首</h3></div><p>暂停时也会暂停游戏中的牌间倒计时。</p></article>
  <article class="feature"><div class="feature-top"><span class="number">11</span><h3>播放进度</h3></div><p>拖动跳转；游戏中限制在当前片段内。</p></article>
  <article class="feature"><div class="feature-top"><span class="number">12</span><h3>音量</h3></div><p>左右拖动，调整歌曲和热场音量。</p></article>
  </div><footer class="fine"><span>ZIP 内需包含 data.csv 与对应音频；图片可选。</span><span>歌牌播放器 · BY 星刃</span></footer></main></body></html>`;
  const source=path.join(here,'使用说明一图流.html');fs.writeFileSync(source,html);
  const guide=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1.5});
  await guide.goto('file:///'+source.replace(/\\/g,'/'));await guide.evaluate(()=>document.fonts.ready);
  const overflow=await guide.evaluate(()=>[...document.querySelectorAll('.feature')].some(el=>el.scrollWidth>el.clientWidth));
  if(overflow)throw new Error('Guide text overflow');
  await guide.screenshot({path:path.join(here,'歌牌播放器-使用说明一图流.png'),fullPage:true});
  console.log('Guide PNG and editable HTML created; text overflow check passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
