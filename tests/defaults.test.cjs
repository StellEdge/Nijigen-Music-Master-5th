const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function setup() {
  const elements = new Map();
  const $ = id => { if(!elements.has(id)) elements.set(id,{value:'',setAttribute(k,v){this[k]=v;}}); return elements.get(id); };
  const warmAudio = {src:'',paused:true,load(){},pause(){this.paused=true;},async play(){this.paused=false;},removeAttribute(){this.src='';},addEventListener(){}};
  const ctx = vm.createContext({$,warmAudio,document:{querySelector:()=>({addEventListener(){}})},URL:{createObjectURL:()=> 'blob:custom',revokeObjectURL(){}},notice(){},iconButton(){},setState(){},prepareAudio(){},resetFade(){},toggle:async()=>{},warmGain:null,performance:{now:()=>0},setTimeout(fn){ctx.finishFade=fn;return 1;},clearTimeout(){ctx.finishFade=null;}});
  vm.runInContext("const warmFadeDuration=3000; let warmFadeStart=null,warmFadeTimer=null; let warmToken=0,warmActive=false,warmFile=null,warmURL=null,state='idle'; const defaultWarmup='assets/GRAND CARD TOUR -The Fifth Anniversary Anthem-.mp3',defaultWarmupLabel='默认：GRAND CARD TOUR -The Fifth Anniversary Anthem-';",ctx);
  vm.runInContext(app.slice(app.indexOf('  function stopWarmup('),app.indexOf('  function allSongs()')),ctx);
  return {ctx,$,warmAudio,run:s=>vm.runInContext(s,ctx)};
}
test('unconfigured warmup uses bundled anthem; toggle stops and clears active button',async()=>{
 const h=setup(); await h.run('playWarmup()');
 assert.equal(h.warmAudio.src,'assets/GRAND CARD TOUR -The Fifth Anniversary Anthem-.mp3');
 assert.equal(h.$('warmup')['aria-pressed'],'true');
 await h.run('playWarmup()');
 assert.equal(h.warmAudio.paused,false); h.ctx.finishFade();
 assert.equal(h.warmAudio.paused,true); assert.equal(h.$('warmup')['aria-pressed'],'false');
});
test('custom audio overrides default; restoring while active plays default',async()=>{
 const h=setup(); h.run('warmFile={size:100}'); await h.run('playWarmup()');
 assert.equal(h.warmAudio.src,'blob:custom');
 h.$('warmupResetButton').onclick(); await Promise.resolve();
 assert.equal(h.warmAudio.src,'assets/GRAND CARD TOUR -The Fifth Anniversary Anthem-.mp3');
 assert.equal(h.$('warmup')['aria-pressed'],'true');
 assert.match(h.$('warmupFileName').textContent,/默认/);
});
test('restoring while stopped does not start playback; failures clear button',async()=>{
 const h=setup(); h.run('warmFile={size:100}'); h.$('warmupResetButton').onclick();
 assert.equal(h.warmAudio.paused,true); assert.equal(h.run('warmFile'),null);
 h.warmAudio.play=async()=>{throw new Error('decode');}; await h.run('playWarmup()');
 assert.equal(h.$('warmup')['aria-pressed'],'false');
});
test('main playback event stops warmup and loop remains enabled independently of game settings',async()=>{
 const h=setup(); await h.run('playWarmup()');
 h.ctx.audio={addEventListener(name,fn){h.mainPlaying=fn;}}; h.ctx.startSpectrum=()=>{};
 vm.runInContext(app.match(/  audio\.addEventListener\('playing',.*startSpectrum\);/)[0],h.ctx);
 h.mainPlaying(); assert.equal(h.warmAudio.paused,true); assert.equal(h.$('warmup')['aria-pressed'],'false');
 assert.match(app,/warmAudio\.loop = true/);
});

test('manual warmup fade reduces volume over three seconds; another playback cancels pending cleanup',async()=>{
 const h=setup(); await h.run('playWarmup()'); await h.run('playWarmup()');
 h.ctx.value=()=>1; h.ctx.audio={currentTime:0}; h.ctx.bounds={start:0,end:10};
 h.ctx.Karuta={envelope:()=>1}; h.ctx.audioContext=null;
 h.warmAudio.duration=100; h.warmAudio.currentTime=10;
 vm.runInContext(app.slice(app.indexOf('  function applyFades()'),app.indexOf('  function resetFade(')),h.ctx);
 h.ctx.performance.now=()=>1500; h.run('applyFades()'); assert.equal(h.warmAudio.volume,.5);
 h.ctx.performance.now=()=>3000; h.run('applyFades()'); assert.equal(h.warmAudio.volume,0);
 h.run('stopWarmup()'); assert.equal(h.ctx.finishFade,null);
 await h.run('playWarmup()'); assert.equal(h.run('warmFadeStart'),null); assert.equal(h.warmAudio.paused,false);
});

test('pack import rejects loose files and mixed selections before reading any ZIP',async()=>{
 const notices=[],reads=[];
 const ctx=vm.createContext({importing:false,packs:[],notice:m=>notices.push(m),KarutaZip:{readZip:async f=>{reads.push(f.name);return new Map();}},importEntries:async()=>{},allSongs:()=>[],issues:[],addIssues(){},renderPacks(){},renderSongs(){},setState(){},state:'idle',openMenu(){}});
 vm.runInContext(app.slice(app.indexOf('  async function importFiles('),app.indexOf("  $('zipButton').onclick")),ctx);
 for(const files of [[{name:'data.csv'}],[{name:'pack.zip'},{name:'song.mp3'}],[{name:'pack.zip',webkitRelativePath:'folder/pack.zip'}]]) {
  ctx.files=files; await vm.runInContext('importFiles(files)',ctx);
 }
 assert.equal(reads.length,0); assert.equal(notices.length,3);
 ctx.files=[{name:'pack.ZIP'}]; await vm.runInContext('importFiles(files)',ctx);
 assert.deepEqual(reads,['pack.ZIP']);
});
