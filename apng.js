"use strict";
// CrunchyVFX — APNG writer. The honest answer to everything GIF costs you: full 8-bit alpha,
// full colour, and an EXACT frame rate.
//
// There is no encoder here at all, which is the trick. The browser already writes a perfect PNG
// for every frame via canvas.toBlob(); an APNG is just those PNGs' compressed image data re-filed
// under animation chunks. So this is pure chunk surgery — parse, re-wrap, re-CRC — and the pixels
// are never touched, let alone re-compressed.
//
// Layout:
//   signature · IHDR (frame 0's) · acTL · fcTL+IDAT (frame 0) · [fcTL+fdAT]… · IEND
// Frame 0 stays a plain IDAT, which is why a viewer with no APNG support still shows a valid
// still image instead of nothing.
//
// vs GIF (see gif.js): APNG keeps soft edges and additive glow intact, and `delay_num/delay_den`
// expresses 24 fps exactly where GIF's centisecond delays cannot. It costs file size, and support
// is browsers + Aseprite + most modern tools, but NOT Discord/Slack inline previews.

// CRC-32, shared with the ZIP writer in index.html (both formats want the same polynomial).
let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

// Walk a PNG's chunk list. Returns { ihdr, idat: [Uint8Array…], width, height }.
function pngChunks(bytes) {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error("not a PNG");
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8, ihdr = null, width = 0, height = 0;
  const idat = [];
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { ihdr = data; width = dv.getUint32(off + 8); height = dv.getUint32(off + 12); }
    else if (type === "IDAT") idat.push(data);       // large frames arrive as several IDATs
    else if (type === "IEND") break;
    off += 12 + len;                                  // len + type(4) + data + crc(4)
  }
  if (!ihdr || !idat.length) throw new Error("PNG had no IHDR/IDAT");
  return { ihdr, idat, width, height };
}

function apngBuf() {
  return {
    d: new Uint8Array(1 << 18), n: 0,
    need(k) {
      if (this.n + k <= this.d.length) return;
      const t = new Uint8Array(Math.max(this.d.length * 2, this.n + k));
      t.set(this.d.subarray(0, this.n)); this.d = t;
    },
    bytes(a) { this.need(a.length); this.d.set(a, this.n); this.n += a.length; },
    u32(v) { this.need(4); const o = this.n; this.d[o] = (v >>> 24) & 255; this.d[o + 1] = (v >>> 16) & 255; this.d[o + 2] = (v >>> 8) & 255; this.d[o + 3] = v & 255; this.n += 4; },
    u16(v) { this.need(2); this.d[this.n++] = (v >>> 8) & 255; this.d[this.n++] = v & 255; },
    u8(v) { this.need(1); this.d[this.n++] = v & 255; },
    // A PNG chunk is length · type · data · CRC(type+data) — big-endian throughout, unlike GIF.
    chunk(type, data) {
      const t = new Uint8Array(4);
      for (let i = 0; i < 4; i++) t[i] = type.charCodeAt(i);
      const body = new Uint8Array(4 + data.length);
      body.set(t, 0); body.set(data, 4);
      this.u32(data.length);
      this.bytes(body);
      this.u32(crc32(body));
    },
    done() { return this.d.subarray(0, this.n); },
  };
}

// canvases → Uint8Array of a complete looping APNG. Async: canvas.toBlob is.
async function encodeApng(canvases, fps, opts) {
  opts = opts || {};
  const parsed = [];
  for (const cv of canvases) {
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    if (!blob) throw new Error("toBlob failed (tainted canvas?)");
    parsed.push(pngChunks(new Uint8Array(await blob.arrayBuffer())));
  }
  const w = parsed[0].width, h = parsed[0].height;

  const buf = apngBuf();
  buf.bytes(new Uint8Array(PNG_SIG));
  buf.chunk("IHDR", parsed[0].ihdr);

  // acTL: frame count + play count (0 = loop forever). Must precede the first IDAT.
  const actl = new Uint8Array(8);
  new DataView(actl.buffer).setUint32(0, parsed.length);
  new DataView(actl.buffer).setUint32(4, opts.loop === undefined ? 0 : opts.loop);
  buf.chunk("acTL", actl);

  // Exact timing, unlike GIF: the delay is the rational number 1/fps, not a rounded centisecond.
  const delayNum = 1, delayDen = Math.max(1, Math.round(fps));
  let seq = 0;
  const fcTL = (s) => {
    const d = new Uint8Array(26);
    const dv = new DataView(d.buffer);
    dv.setUint32(0, s);        // sequence number
    dv.setUint32(4, w); dv.setUint32(8, h);
    dv.setUint32(12, 0); dv.setUint32(16, 0);        // x, y offset — always full-frame here
    dv.setUint16(20, delayNum); dv.setUint16(22, delayDen);
    d[24] = 0;                 // dispose_op NONE
    d[25] = 0;                 // blend_op SOURCE — each frame replaces the buffer, alpha included,
                               // so nothing accumulates and transparency stays transparent
    return d;
  };

  for (let i = 0; i < parsed.length; i++) {
    buf.chunk("fcTL", fcTL(seq++));
    if (i === 0) {
      // Frame 0 rides in a normal IDAT, so non-APNG viewers still see a valid still image.
      for (const part of parsed[i].idat) buf.chunk("IDAT", part);
    } else {
      for (const part of parsed[i].idat) {
        const d = new Uint8Array(4 + part.length);
        new DataView(d.buffer).setUint32(0, seq++);   // every fdAT carries its own sequence number
        d.set(part, 4);
        buf.chunk("fdAT", d);
      }
    }
  }
  buf.chunk("IEND", new Uint8Array(0));
  return buf.done();
}
