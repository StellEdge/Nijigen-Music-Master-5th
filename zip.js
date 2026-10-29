/* ZIP central-directory reader. Audio is extracted only when requested. No dependencies. */
(function () {
  'use strict';
  const MAX_FILE = 512 * 1024 * 1024;
  const crcTable = Array.from({length:256},(_,i) => { let n = i; for(let b = 0; b < 8; b++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); return n >>> 0; });
  function crc32(bytes) {
    let crc = -1;
    for (const b of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 255];
    return (crc ^ -1) >>> 0;
  }
  async function readZip(file) {
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
    const view = new DataView(tail.buffer); let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === tail.length) { end = i; break; }
    if (end < 0) throw new Error('不是有效的 ZIP 文件');
    const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count) throw new Error('不支持分卷 ZIP');
    if (count === 65535 || offset === 0xffffffff || size > 32 * 1024 * 1024) throw new Error('不支持 ZIP64 或过大的目录，请解压后导入文件夹');
    if (offset + size > file.size) throw new Error('ZIP 目录损坏');
    const data = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()), d = new DataView(data.buffer), entries = new Map();
    let p = 0;
    for (let n = 0; n < count; n++) {
      if (p + 46 > data.length || d.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP 目录损坏');
      const flags = d.getUint16(p + 8, true), method = d.getUint16(p + 10, true), crc = d.getUint32(p + 16, true);
      const compressed = d.getUint32(p + 20, true), raw = d.getUint32(p + 24, true), len = d.getUint16(p + 28, true);
      const extra = d.getUint16(p + 30, true), comment = d.getUint16(p + 32, true), local = d.getUint32(p + 42, true);
      if (p + 46 + len + extra + comment > data.length) throw new Error('ZIP 文件名损坏');
      const nameBytes = data.slice(p + 46, p + 46 + len);
      let name = Karuta.decode(nameBytes, flags & 0x800 ? 'utf-8' : 'auto');
      // Info-ZIP Unicode Path extra field takes precedence over legacy filenames.
      let ep = p + 46 + len;
      while (ep + 4 <= p + 46 + len + extra) {
        const tag = d.getUint16(ep, true), el = d.getUint16(ep + 2, true); ep += 4;
        if (ep + el > p + 46 + len + extra) throw new Error('ZIP 扩展字段损坏');
        if (tag === 0x7075 && el >= 5 && data[ep] === 1 && d.getUint32(ep + 1, true) === crc32(nameBytes)) name = Karuta.decode(data.slice(ep + 5, ep + el), 'utf-8');
        ep += el;
      }
      p += 46 + len + extra + comment;
      if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
      name = Karuta.path(name);
      if (entries.has(name)) throw new Error('ZIP 含重名路径：' + name);
      entries.set(name, { async getBlob() {
        if (flags & 1) throw new Error('不支持加密 ZIP，请先解压');
        if (raw > MAX_FILE || (compressed && raw / compressed > 1000)) throw new Error('ZIP 单文件过大或压缩比例异常');
        if (method !== 0 && method !== 8) throw new Error('仅支持 ZIP Store / Deflate，请先解压');
        const header = new DataView(await file.slice(local, local + 30).arrayBuffer());
        if (header.byteLength < 30 || header.getUint32(0, true) !== 0x04034b50) throw new Error('ZIP 文件头损坏');
        const begin = local + 30 + header.getUint16(26, true) + header.getUint16(28, true);
        if (begin + compressed > file.size) throw new Error('ZIP 文件截断');
        let blob = file.slice(begin, begin + compressed);
        if(!(blob instanceof Blob) && typeof blob.getBlob === 'function') blob = await blob.getBlob();
        if (method === 8) {
          let ds; try { ds = new DecompressionStream('deflate-raw'); } catch { throw new Error('此浏览器无法解压 ZIP，请解压后导入文件夹'); }
          const reader = blob.stream().pipeThrough(ds).getReader(), chunks = []; let total = 0;
          try { while (true) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > raw || total > MAX_FILE) throw new Error('ZIP 解压大小异常'); chunks.push(value); } }
          catch (e) { await reader.cancel().catch(() => {}); throw e; }
          blob = new Blob(chunks);
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.length !== raw || crc32(bytes) !== crc) throw new Error('ZIP 文件校验失败：' + name);
        return blob;
      } });
    }
    return entries;
  }
  globalThis.KarutaZip = { readZip, crc32 };
})();
