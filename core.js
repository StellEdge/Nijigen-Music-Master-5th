(function (root) {
  'use strict';
  function csv(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else if (quoted || cell === '') quoted = !quoted;
        else cell += c;
      } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (quoted) throw new Error('CSV 引号未闭合');
    row.push(cell); if (row.some(v => v.trim())) rows.push(row);
    return rows;
  }
  function path(value) {
    value = value.replace(/\\/g, '/').normalize('NFC');
    if (/^(?:\/|[a-z]:|[a-z]+:\/\/)/i.test(value)) throw new Error('文件路径必须相对于歌包');
    const parts = [];
    for (const p of value.split('/')) {
      if (!p || p === '.') continue;
      if (p === '..' || p.includes('\0')) throw new Error('歌包路径不能包含 .. 或空字符');
      parts.push(p);
    }
    return parts.join('/');
  }
  function decode(bytes, encoding = 'auto') {
    if (encoding !== 'auto') return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('gb18030').decode(bytes); }
  }
  function randomUnit() {
    if(globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    return Math.random();
  }
  function shuffle(items, random = randomUnit) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function parsePack(text, directory, entries) {
    const rows = csv(text), songs = [], errors = [];
    if (!rows.length) throw new Error('CSV 为空');
    const headers = rows.shift().map(v => v.trim().toLowerCase());
    const columns = ['no', 'title', 'subtitle', 'artist', 'translated', 'animation', 'music', 'image'];
    for (const key of ['title', 'music']) if (!headers.includes(key)) throw new Error('CSV 缺少列：' + key);
    const byLower = new Map();
    for (const key of entries.keys()) {
      const lower = key.toLowerCase(); byLower.set(lower, byLower.has(lower) ? null : key);
    }
    function find(relative) {
      const key = path((directory ? directory + '/' : '') + path(relative));
      return entries.has(key) ? key : byLower.get(key.toLowerCase());
    }
    rows.forEach((row, i) => {
      try {
        const song = Object.fromEntries(columns.map(k => [k, (row[headers.indexOf(k)] || '').trim()]));
        if (!song.title || !song.music) throw new Error('歌名或音频路径为空');
        song.audioPath = find(song.music);
        if (!song.audioPath) throw new Error('找不到音频：' + song.music);
        song.imagePath = song.image ? find(song.image) : null;
        if (song.image && !song.imagePath) errors.push(`第 ${i + 2} 行：找不到图片 ${song.image}`);
        songs.push(song);
      } catch (e) { errors.push(`第 ${i + 2} 行：${e.message}`); }
    });
    return { songs, errors };
  }
  function segment(duration, start, length, randomStart, random = randomUnit, maxRandomStart = Infinity) {
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取音频时长');
    const size = length > 0 ? Math.min(length, duration) : duration;
    const offset = randomStart && length > 0 ? random() * Math.min(duration - size,Math.max(0,maxRandomStart)) : Math.min(Math.max(0, start), Math.max(0, duration - 0.05));
    return { start: offset, end: length > 0 ? Math.min(duration, offset + size) : duration };
  }
  function envelope(position, start, end) {
    const span = Math.max(0,end - start);
    if (!span || position < start || position >= end) return 0;
    return Math.min(1,(position - start) / Math.min(.45,span / 3),(end - position) / Math.min(.65,span / 3));
  }
  function revealWindow(position, start, end) {
    return end > start && position >= end - Math.min(3,(end - start) / 3);
  }
  function spectrumBars(width, data) {
    const half = Math.max(12,Math.min(256,Math.round(width * .94 / 24)));
    const step = width * .94 / (half * 2), barWidth = step * .62, bars = [];
    for(let i = 0; i < half; i++) {
      // Aggregate each logarithmic band so narrow treble peaks are not skipped.
      const binAt = position => Math.min(data.length - 1,Math.round(2 * Math.exp(Math.log(data.length / 2) * position / (half - 1))));
      const start = binAt(Math.max(0,i - .5)), end = binAt(Math.min(half - 1,i + .5));
      let energy = 0;
      for(let bin = start; bin <= end; bin++) energy += data[bin] * data[bin];
      const amplitude = Math.sqrt(energy / (end - start + 1));
      // Gradually lift weak treble without multiplying loud peaks into a hard cap.
      const treble = Math.max(0,(i / (half - 1) - .45) / .55);
      const floor = 20 - 14 * treble;
      const level = Math.max(0,Math.min(1,(amplitude - floor) / (255 - floor)));
      const magnitude = .92 * Math.pow(level,1.65 - .8 * treble);
      const right = width / 2 + i * step + (step - barWidth) / 2;
      bars.push({x:right,width:barWidth,magnitude},{x:width - right - barWidth,width:barWidth,magnitude});
    }
    return bars;
  }
  const api = { csv, path, decode, shuffle, parsePack, segment, envelope, revealWindow, randomUnit, spectrumBars };
  if (typeof module !== 'undefined') module.exports = api;
  root.Karuta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
