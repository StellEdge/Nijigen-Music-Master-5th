const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../core.js');
global.Karuta = K;
require('../zip.js');

test('CSV supports BOM, CRLF, escaped quotes, commas and multiline cells', () => {
  assert.deepEqual(K.csv('\uFEFFno,title\r\n1,"a,b"\r\n2,"a""b\nc"\r\n'), [['no','title'],['1','a,b'],['2','a"b\nc']]);
  assert.throws(() => K.csv('"oops'), /引号/);
});
test('paths normalize separators and reject traversal / absolute paths', () => {
  assert.equal(K.path('A\\./b.mp3'),'A/b.mp3');
  for(const p of ['../secret','/secret','C:\\secret','https://evil/a','a/../b']) assert.throws(() => K.path(p));
});
test('real Unity packs load all rows and resources', { skip: !process.env.KARUTA_MUSIC_DATA && 'Set KARUTA_MUSIC_DATA to test private packs' }, () => {
  const base = path.resolve(process.env.KARUTA_MUSIC_DATA);
  for(const name of ['CoreSet','Dark']) {
    const names = fs.readdirSync(path.join(base,name));
    const entries = new Map(names.map(n => [name + '/' + n,{}]));
    const text = K.decode(fs.readFileSync(path.join(base,name,'data.csv')));
    const parsed = K.parsePack(text,name,entries);
    assert.equal(parsed.songs.length,name === 'Dark' ? 50 : 2);
    assert.deepEqual(parsed.errors,name === 'Dark' ? ['第 29 行：找不到图片 028-寄生兽-生命的准则.jpg'] : []);
  }
});
test('bad rows are isolated; duplicate titles do not lose songs; images optional', () => {
  const entries = new Map([['P/a.mp3',{}],['P/b.mp3',{}]]);
  const p = K.parsePack('title,music,image\nSame,a.mp3,\nSame,B.MP3,missing.jpg\nBad,../bad,\nBad,no.mp3,','P',entries);
  assert.equal(p.songs.length,2); assert.equal(p.errors.length,3);
  assert.equal(p.songs[1].audioPath,'P/b.mp3');
});
test('ambiguous case-insensitive files are never chosen arbitrarily', () => {
  const entries = new Map([['a.mp3',{}],['A.mp3',{}]]);
  assert.equal(K.parsePack('title,music\na,a.MP3','',entries).songs.length,0);
});
test('segments clamp short tracks, offsets, whole tracks and random positions', () => {
  assert.deepEqual(K.segment(10,0,30,false),{start:0,end:10});
  assert.deepEqual(K.segment(100,20,0,false),{start:20,end:100});
  assert.deepEqual(K.segment(100,0,20,true,() => .5),{start:40,end:60});
  assert.ok(K.segment(10,500,30,false).start < 10);
  assert.throws(() => K.segment(NaN,0,30,false));
});
test('shuffle preserves exactly every song and never mutates source', () => {
  const input = [1,2,3,4]; const out = K.shuffle(input,() => 0);
  assert.deepEqual(input,[1,2,3,4]); assert.deepEqual([...out].sort(),input); assert.notDeepEqual(out,input);
  assert.deepEqual(K.shuffle([]),[]); assert.deepEqual(K.shuffle([1]),[1]);
});
test('Fisher-Yates reaches all six permutations of three songs equally', () => {
  const permutations = new Set();
  for(let a = 0; a < 3; a++) for(let b = 0; b < 2; b++) {
    const values = [(a + .5) / 3,(b + .5) / 2];
    permutations.add(K.shuffle([1,2,3],() => values.shift()).join(','));
  }
  assert.equal(permutations.size,6);
  for(let i = 0; i < 100; i++) { const n = K.randomUnit(); assert.ok(n >= 0 && n < 1); }
});
test('TVSize limits random starts to first 80 seconds, independently of 30-second segments', () => {
  assert.deepEqual(K.segment(300,0,30,true,() => 1,80),{start:80,end:110});
  assert.deepEqual(K.segment(300,0,30,true,() => 0,80),{start:0,end:30});
  assert.deepEqual(K.segment(50,0,30,true,() => 1,80),{start:20,end:50});
  assert.deepEqual(K.segment(300,0,30,true,() => 1),{start:270,end:300});
});
test('reveal only occurs in last three seconds or final third of a short clip', () => {
  assert.equal(K.revealWindow(26.9,0,30),false);
  assert.equal(K.revealWindow(27,0,30),true);
  assert.equal(K.revealWindow(46.9,20,50),false);
  assert.equal(K.revealWindow(47,20,50),true);
  assert.equal(K.revealWindow(.5,0,1),false);
  assert.equal(K.revealWindow(.7,0,1),true);
});
test('fade envelope is silent at boundaries, full in middle and proportional for short clips', () => {
  assert.equal(K.envelope(0,0,30),0);
  assert.equal(K.envelope(.225,0,30),.5);
  assert.equal(K.envelope(10,0,30),1);
  assert.ok(Math.abs(K.envelope(29.675,0,30) - .5) < 1e-10);
  assert.equal(K.envelope(30,0,30),0);
  assert.equal(K.envelope(.5,0,1),1);
  assert.equal(K.envelope(20,20,50),0);
});
test('GBK legacy CSV decoding', () => {
  assert.equal(K.decode(Uint8Array.from([0xd6,0xd0,0xce,0xc4])),'中文');
});
test('CRC32 and corrupt ZIP rejection', async () => {
  assert.equal(KarutaZip.crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  await assert.rejects(KarutaZip.readZip(new Blob(['not a zip'])), /ZIP/);
});
test('spectrum is mirrored and gains bars on wider screens at a stable density', () => {
  const data = Uint8Array.from({length:1024},(_,i) => i % 256);
  let previousCount = 0;
  for(const width of [320,1440,3840]) {
    const bars = K.spectrumBars(width,data);
    assert.ok(bars.length > previousCount); previousCount = bars.length;
    assert.ok(width * .94 / bars.length > 11 && width * .94 / bars.length < 13);
    for(let i = 0; i < bars.length; i += 2) {
      assert.equal(bars[i].magnitude,bars[i+1].magnitude);
      assert.ok(Math.abs(bars[i].x + bars[i+1].x + bars[i].width - width) < 1e-9);
    }
  }
});

test('spectrum preserves loud-bin contrast without clipping and leaves peak headroom', () => {
  const magnitude = value => K.spectrumBars(1440,new Uint8Array(1024).fill(value))[0].magnitude;
  assert.equal(magnitude(0),0);
  assert.equal(magnitude(20),0);
  assert.ok(magnitude(100) > .15);
  assert.ok(magnitude(160) > .38);
  assert.ok(magnitude(220) < .75);
  assert.equal(magnitude(255),.92);
  for(let value = 1; value <= 255; value++) {
    assert.ok(magnitude(value) >= magnitude(value - 1));
    assert.ok(magnitude(value) >= 0 && magnitude(value) <= .92);
    if(value > 20) assert.ok(magnitude(value) > magnitude(value - 1));
  }
  assert.ok(magnitude(240) - magnitude(220) > .11);
  assert.ok(magnitude(255) - magnitude(240) > .09);
});

test('treble compensation reveals quiet highs without lifting silence or clipping peaks', () => {
  const quiet = K.spectrumBars(1440,new Uint8Array(1024).fill(60));
  assert.ok(quiet.at(-1).magnitude > .2);
  assert.ok(quiet.at(-1).magnitude > quiet[0].magnitude * 4);
  assert.ok(K.spectrumBars(1440,new Uint8Array(1024)).every(bar => bar.magnitude === 0));
  const loud = K.spectrumBars(1440,new Uint8Array(1024).fill(240));
  assert.ok(loud.every(bar => bar.magnitude < .92));
  assert.ok(loud.at(-1).magnitude > quiet.at(-1).magnitude);
  const narrow = new Uint8Array(1024); narrow[1000] = 200;
  assert.ok(K.spectrumBars(1440,narrow).at(-1).magnitude > 0);
});
