'use strict';
// ZIP store method preserves the original asset bytes; UTF-8 filenames are flagged.
function makeAssetZip(files) {
  const encoder = new TextEncoder(), parts = [], directory = [];
  let offset = 0;
  const crc32 = bytes => {
    let crc = 0xffffffff;
    for (const b of bytes) {
      crc ^= b;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  for (const file of files) {
    const name = encoder.encode(file.name), size = file.bytes.length, crc = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
    l.setUint16(12, 33, true); l.setUint32(14, crc, true);
    l.setUint32(18, size, true); l.setUint32(22, size, true); l.setUint16(26, name.length, true);
    local.set(name, 30); parts.push(local, file.bytes);
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true); c.setUint16(14, 33, true); c.setUint32(16, crc, true);
    c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true); central.set(name, 46); directory.push(central);
    offset += local.length + size;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, directory.reduce((n, x) => n + x.length, 0), true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], {type: 'application/zip'});
}

if(typeof module==='object'&&module.exports)module.exports={makeAssetZip};
