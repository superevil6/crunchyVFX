"use strict";
// CrunchyVFX — a from-scratch GIF89a encoder. No dependencies, in the same hand-rolled spirit as
// CrunchySFX's WAV writer and this repo's STORE-only ZIP writer.
//
// Its own file because it's pure and domain-agnostic: when the shared `core.js` sibling gets
// extracted (see VFX-DESIGN.md §5) this moves across as-is, not by surgery.
//
// Three parts: a median-cut quantizer (24-bit truecolour → 255 colours + transparency), a
// nearest-colour mapper with a 15-bit cache, and the LZW + block assembly.
//
// Known and deliberate limits of the format, surfaced in the export dialog rather than hidden:
//   • ALPHA IS 1 BIT. There is no partial transparency in a GIF — a pixel is either fully opaque
//     or fully gone. Soft additive edges therefore fringe against whatever background the GIF
//     ends up on. The fix lives in the app, not here: raise `alphaCut` so the sprite has hard
//     edges by design.
//   • DELAYS ARE WHOLE CENTISECONDS, so only fps values dividing 100 are exact (50/25/20/10).
//     24 fps becomes 4cs = 25 fps. gifDelayCs() reports what you'll actually get.
//   • One global palette shared by every frame. Per-frame local tables would buy a little
//     quality; they'd also triple the complexity for a format we recommend against anyway.

const GIF_MAX_COLORS = 255;    // index 0 is reserved for transparency
const GIF_ALPHA_MIN = 128;     // below this a pixel becomes transparent (1-bit alpha, no choice)
const GIF_SAMPLE_CAP = 32768;  // pixels fed to the quantizer; more barely moves the palette

// fps values whose frame delay is a whole number of centiseconds
const GIF_EXACT_FPS = [10, 20, 25, 50];

// What the GIF will ACTUALLY play at, given a requested fps.
function gifDelayCs(fps) {
  const cs = Math.max(2, Math.round(100 / fps));   // <2cs is clamped to 10cs by most renderers
  return { cs, fps: 100 / cs, exact: Math.abs(100 / cs - fps) < 0.01 };
}

// ---------- sampling ----------
// Pull opaque pixels from every frame, evenly strided, packed as 0xRRGGBB.
function gifSamples(datas) {
  let opaque = 0;
  for (const d of datas) for (let i = 3; i < d.length; i += 4) if (d[i] >= GIF_ALPHA_MIN) opaque++;
  if (!opaque) return new Int32Array(0);
  const stride = Math.max(1, Math.ceil(opaque / GIF_SAMPLE_CAP));
  const out = new Int32Array(Math.ceil(opaque / stride) + 1);
  let n = 0, seen = 0;
  for (const d of datas) {
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < GIF_ALPHA_MIN) continue;
      if (seen++ % stride) continue;
      if (n < out.length) out[n++] = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    }
  }
  return out.subarray(0, n);
}

// ---------- median cut ----------
// Repeatedly split the box with the widest channel spread at its median, then average each box.
// Cheap, stable, and it handles the thing that matters here: a fire effect is 200 shades of
// orange and 3 of everything else, and median cut spends its palette where the pixels are.
function gifMedianCut(samples, maxColors) {
  if (!samples.length) return [[0, 0, 0]];
  const chOf = (v, sh) => (v >> sh) & 255;
  const boxes = [{ lo: 0, hi: samples.length }];

  const spread = (b) => {           // widest channel of a box: [range, shift]
    let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
    for (let i = b.lo; i < b.hi; i++) {
      const v = samples[i], r = chOf(v, 16), g = chOf(v, 8), bl = v & 255;
      if (r < r0) r0 = r; if (r > r1) r1 = r;
      if (g < g0) g0 = g; if (g > g1) g1 = g;
      if (bl < b0) b0 = bl; if (bl > b1) b1 = bl;
    }
    const dr = r1 - r0, dg = g1 - g0, db = b1 - b0;
    if (dr >= dg && dr >= db) return [dr, 16];
    if (dg >= db) return [dg, 8];
    return [db, 0];
  };

  while (boxes.length < maxColors) {
    let best = -1, bestRange = 0, bestShift = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].hi - boxes[i].lo < 2) continue;
      const [range, sh] = spread(boxes[i]);
      if (range > bestRange) { bestRange = range; best = i; bestShift = sh; }
    }
    if (best < 0 || bestRange === 0) break;      // every box is a single colour — done
    const b = boxes[best], sh = bestShift;
    // subarray shares the buffer, so this sorts the box's range in place
    samples.subarray(b.lo, b.hi).sort((x, y) => ((x >> sh) & 255) - ((y >> sh) & 255));
    const mid = b.lo + ((b.hi - b.lo) >> 1);
    boxes[best] = { lo: b.lo, hi: mid };
    boxes.push({ lo: mid, hi: b.hi });
  }

  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0;
    const n = b.hi - b.lo;
    for (let i = b.lo; i < b.hi; i++) {
      const v = samples[i];
      r += (v >> 16) & 255; g += (v >> 8) & 255; bl += v & 255;
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
}

// ---------- nearest-colour mapping ----------
// A 15-bit (5:5:5) cache turns "255 distance checks per pixel" into "255 checks per DISTINCT
// colour", which is the difference between a snappy export and a two-second freeze.
function gifMap(datas, palette, w, h) {
  const cache = new Int16Array(32768).fill(-1);
  const nCol = palette.length;
  const out = [];
  for (const d of datas) {
    const px = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < px.length; i += 4, p++) {
      if (d[i + 3] < GIF_ALPHA_MIN) { px[p] = 0; continue; }
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let idx = cache[key];
      if (idx < 0) {
        let bd = Infinity, bi = 0;
        for (let c = 0; c < nCol; c++) {
          const pc = palette[c];
          const dr = r - pc[0], dg = g - pc[1], db = b - pc[2];
          const dist = dr * dr * 2 + dg * dg * 4 + db * db;   // roughly perceptual weighting
          if (dist < bd) { bd = dist; bi = c; }
        }
        idx = bi + 1;            // +1: index 0 belongs to transparency
        cache[key] = idx;
      }
      px[p] = idx;
    }
    out.push(px);
  }
  return out;
}

// ---------- byte sink ----------
function gifBuf() {
  return {
    d: new Uint8Array(1 << 16), n: 0,
    need(k) { if (this.n + k > this.d.length) { const t = new Uint8Array(Math.max(this.d.length * 2, this.n + k)); t.set(this.d.subarray(0, this.n)); this.d = t; } },
    b(v) { this.need(1); this.d[this.n++] = v & 255; },
    b16(v) { this.b(v); this.b(v >> 8); },                       // GIF is little-endian
    s(str) { for (let i = 0; i < str.length; i++) this.b(str.charCodeAt(i)); },
    done() { return this.d.subarray(0, this.n); },
  };
}

// ---------- LZW ----------
// Variable-width codes, LSB-first, packed into 255-byte sub-blocks. The code-size bump has to
// happen BEFORE the new code is assigned, or the decoder reads at the wrong width and the image
// dissolves into noise partway down — the classic GIF encoder bug.
function gifLzw(buf, px, minCodeSize) {
  buf.b(minCodeSize);
  const clear = 1 << minCodeSize, eoi = clear + 1;
  let codeSize = minCodeSize + 1, next = eoi + 1;
  let dict = new Map();

  let acc = 0, accBits = 0, bn = 0;
  const block = new Uint8Array(255);
  const flush = () => { if (bn) { buf.b(bn); for (let i = 0; i < bn; i++) buf.b(block[i]); bn = 0; } };
  const emit = (code) => {
    acc |= code << accBits; accBits += codeSize;
    while (accBits >= 8) {
      block[bn++] = acc & 255; acc >>>= 8; accBits -= 8;
      if (bn === 255) flush();
    }
  };

  emit(clear);
  let cur = px[0];
  for (let i = 1; i < px.length; i++) {
    const k = px[i], key = (cur << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) { cur = found; continue; }
    emit(cur);
    if (next === 4096) {                       // table full — start over
      emit(clear);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (next >= (1 << codeSize)) codeSize++;
      dict.set(key, next++);
    }
    cur = k;
  }
  emit(cur);
  emit(eoi);
  while (accBits > 0) { block[bn++] = acc & 255; acc >>>= 8; accBits -= 8; if (bn === 255) flush(); }
  flush();
  buf.b(0);   // block terminator
}

// ---------- the public entry point ----------
// canvases → Uint8Array of a complete, looping, transparent GIF89a.
function encodeGif(canvases, fps, opts) {
  opts = opts || {};
  const w = canvases[0].width, h = canvases[0].height;
  const datas = canvases.map((cv) => cv.getContext("2d").getImageData(0, 0, w, h).data);
  const palette = gifMedianCut(gifSamples(datas), opts.maxColors || GIF_MAX_COLORS);
  const indexed = gifMap(datas, palette, w, h);
  const delay = gifDelayCs(fps).cs;

  const buf = gifBuf();
  buf.s("GIF89a");
  buf.b16(w); buf.b16(h);
  buf.b(0xF7);   // global colour table present, 8-bit colour, 256 entries
  buf.b(0);      // background colour index
  buf.b(0);      // pixel aspect ratio (0 = unspecified)

  buf.b(0); buf.b(0); buf.b(0);                                  // entry 0 = the transparent slot
  for (let i = 0; i < 255; i++) {
    const c = palette[i] || [0, 0, 0];
    buf.b(c[0]); buf.b(c[1]); buf.b(c[2]);
  }

  // NETSCAPE2.0 application extension — the only way to say "loop forever"
  buf.b(0x21); buf.b(0xFF); buf.b(0x0B);
  buf.s("NETSCAPE2.0");
  buf.b(0x03); buf.b(0x01); buf.b16(opts.loop === undefined ? 0 : opts.loop); buf.b(0);

  for (const px of indexed) {
    // Graphic control extension. Disposal method 2 (restore to background) is mandatory here:
    // without it every frame composites onto the last and the transparent areas smear.
    buf.b(0x21); buf.b(0xF9); buf.b(0x04);
    buf.b(0x09);                 // disposal 2 (bits 4-2) | transparent colour flag (bit 0)
    buf.b16(delay);
    buf.b(0);                    // transparent colour index
    buf.b(0);
    // image descriptor: full-frame, no local colour table, not interlaced
    buf.b(0x2C); buf.b16(0); buf.b16(0); buf.b16(w); buf.b16(h); buf.b(0);
    gifLzw(buf, px, 8);
  }

  buf.b(0x3B);   // trailer
  return buf.done();
}
