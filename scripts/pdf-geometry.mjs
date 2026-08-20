/**
 * Read a PDF back and say where things actually landed, in millimetres.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/proxy-sheet-measure.mjs` measures `getBoundingClientRect` under
 * print emulation. That is the layout engine's opinion of the sheet, and it is
 * worth having, but it is still the CSS side of the wall. It cannot see what
 * the print pipeline did with those boxes afterwards, and the print pipeline
 * does change them: Chrome snaps every drawn image to a whole CSS pixel, so a
 * row of cards the stylesheet placed at 88.000 mm can be emitted at 87.85 mm.
 * A tenth of a millimetre does not matter, but nobody knew whether it was a
 * tenth or a millimetre until it was read out of the file.
 *
 * So this parses the bytes a printer is actually handed: it walks the page
 * content stream, tracks the transform matrix through q/Q/cm, and reports the
 * real device-space rectangle of every image drawn and every rectangle filled.
 * Nothing here reads the DOM, the stylesheet or the geometry constants.
 *
 * It is deliberately a minimal interpreter rather than a PDF library, because
 * the only operators these two producers emit are q, Q, cm, re, f, rg, gs, Do
 * and the marked-content noise around them. Anything it does not understand it
 * ignores, and an unrecognised operator cannot silently move a card: the only
 * things that move a card are cm and q/Q, all three of which are handled.
 */
import zlib from 'node:zlib';

export const PT_PER_MM = 72 / 25.4;

/* ------------------------------------------------------------------ *
 * Objects
 * ------------------------------------------------------------------ */

/**
 * Index every `N 0 obj … endobj` in the file.
 *
 * Streams are located by byte offset rather than by string search on the whole
 * file, because image data is binary and regularly contains the literal bytes
 * `endobj`. The dictionary is text and safe to match; the payload is sliced.
 */
export function readObjects(buf) {
  const lat = buf.toString('latin1');
  const objects = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(lat))) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const streamAt = lat.indexOf('stream', bodyStart);
    const endObj = lat.indexOf('endobj', bodyStart);
    const hasStream = streamAt !== -1 && (endObj === -1 || streamAt < endObj);
    const dict = lat.slice(bodyStart, hasStream ? streamAt : endObj === -1 ? bodyStart : endObj);

    let stream = null;
    if (hasStream) {
      // Skip the EOL after the `stream` keyword: CRLF or a bare LF, never CR.
      let s = streamAt + 'stream'.length;
      if (lat[s] === '\r') s++;
      if (lat[s] === '\n') s++;
      const e = lat.indexOf('endstream', s);
      if (e !== -1) stream = buf.subarray(s, e);
    }
    objects.set(num, { num, dict, stream });
  }
  return objects;
}

/** Inflate if the dictionary says so. Returns null for anything else. */
export function streamData(obj) {
  if (!obj?.stream) return null;
  if (/\/Filter\s*\/FlateDecode/.test(obj.dict) || /\/Filter\s*\[\s*\/FlateDecode/.test(obj.dict)) {
    try {
      return zlib.inflateSync(obj.stream);
    } catch {
      /* jsPDF pads streams; inflate what it can rather than dropping the page. */
      try {
        return zlib.inflateSync(obj.stream, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      } catch {
        return null;
      }
    }
  }
  if (/\/Filter/.test(obj.dict)) return null; // DCTDecode etc: image bytes, not content
  return obj.stream;
}

const refOf = (dict, key) => {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict);
  return m ? Number(m[1]) : null;
};

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */

/**
 * Every page, with its MediaBox in mm and its decoded content stream.
 *
 * Pages are found by scanning for `/Type /Page` objects rather than by walking
 * the page tree from the catalogue. Both producers emit a flat tree, and a
 * scan cannot be fooled by a Kids array whose order disagrees with the file.
 * Order is by object number, which is the order both producers write pages in;
 * the checks below never depend on which page is which beyond "page 1 exists".
 */
export function readPages(buf) {
  const objects = readObjects(buf);
  const pages = [];

  for (const obj of objects.values()) {
    if (!/\/Type\s*\/Page\b/.test(obj.dict)) continue;
    if (/\/Type\s*\/Pages\b/.test(obj.dict)) continue;

    const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(obj.dict);
    const inherited = box ? null : findInheritedBox(objects, obj);
    const b = box ?? inherited;

    // Contents may be one stream or an array of them; concatenate in order.
    let content = Buffer.alloc(0);
    const single = refOf(obj.dict, 'Contents');
    const arr = /\/Contents\s*\[([^\]]*)\]/.exec(obj.dict);
    const ids = arr
      ? [...arr[1].matchAll(/(\d+)\s+\d+\s+R/g)].map(x => Number(x[1]))
      : single != null
        ? [single]
        : [];
    for (const id of ids) {
      const d = streamData(objects.get(id));
      if (d) content = Buffer.concat([content, d, Buffer.from('\n')]);
    }

    pages.push({
      num: obj.num,
      widthMm: b ? (Number(b[3]) - Number(b[1])) / PT_PER_MM : null,
      heightMm: b ? (Number(b[4]) - Number(b[2])) / PT_PER_MM : null,
      heightPt: b ? Number(b[4]) - Number(b[2]) : null,
      content: content.toString('latin1'),
      resources: readResources(objects, obj),
      objects,
    });
  }

  pages.sort((a, b) => a.num - b.num);
  return pages;
}

function findInheritedBox(objects, page) {
  let parent = refOf(page.dict, 'Parent');
  for (let i = 0; i < 8 && parent != null; i++) {
    const p = objects.get(parent);
    if (!p) break;
    const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(p.dict);
    if (box) return box;
    parent = refOf(p.dict, 'Parent');
  }
  return null;
}

/** `/XObject << /X4 12 0 R … >>` → the pixel size of each image it names. */
function readResources(objects, page) {
  let dict = page.dict;
  const resRef = refOf(dict, 'Resources');
  if (resRef != null) dict = objects.get(resRef)?.dict ?? dict;

  const xoRef = refOf(dict, 'XObject');
  let xoDict = null;
  if (xoRef != null) xoDict = objects.get(xoRef)?.dict ?? null;
  else {
    const inline = /\/XObject\s*<<([\s\S]*?)>>/.exec(dict);
    xoDict = inline ? inline[1] : null;
  }
  if (!xoDict) return {};

  const images = {};
  for (const m of xoDict.matchAll(/\/([A-Za-z0-9_]+)\s+(\d+)\s+\d+\s+R/g)) {
    const target = objects.get(Number(m[2]));
    if (!target) continue;
    const w = /\/Width\s+(\d+)/.exec(target.dict);
    const h = /\/Height\s+(\d+)/.exec(target.dict);
    images[m[1]] = {
      name: m[1],
      pxW: w ? Number(w[1]) : null,
      pxH: h ? Number(h[1]) : null,
      isImage: /\/Subtype\s*\/Image/.test(target.dict),
      filter: (/\/Filter\s*\/(\w+)/.exec(target.dict) || [])[1] ?? null,
      /* A /SMask or an explicit /Decode would mean the drawn pixels are not the
         asset's own pixels. Neither producer should emit either. */
      hasSMask: /\/SMask/.test(target.dict),
    };
  }
  return images;
}

/* ------------------------------------------------------------------ *
 * The interpreter
 * ------------------------------------------------------------------ */

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Walk one page and return every image draw and rectangle fill in mm,
 * measured from the TOP LEFT of the paper so the numbers line up with the
 * millimetres in `proxy-geometry.ts` without anyone having to flip a sign.
 *
 * An image XObject is defined on the unit square, so its device rectangle is
 * the unit square through the current matrix. That is the whole measurement:
 * whatever the producer intended, this is where the ink goes.
 */
export function drawnItems(page) {
  const toks = page.content.match(/<<[\s\S]*?>>|\[[^\]]*\]|\/[^\s/<>\[\]()]+|[-+]?[\d.]+|[A-Za-z*'"]+/g) ?? [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const operands = [];
  let fill = [0, 0, 0];

  /*
   * The active clip, not merely every clip the page mentions.
   *
   * A clip set inside `q … Q` stops applying at the `Q`, so collecting clips
   * into one flat list and comparing a card against all of them reports a crop
   * that is not there: Chrome sets a tight clip around each text run, and every
   * one of those would look like it was cutting the cards. Clipping is the one
   * thing this sheet is not allowed to do to a card, so the check has to be
   * exact or it is worse than no check. `clip` is the running intersection, in
   * millimetres from the top left, and it is saved and restored with the CTM.
   */
  let clip = null;

  const images = [];
  const rects = [];
  const clips = [];
  let pendingRect = null;
  let pendingClip = false;

  const intersect = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const x0 = Math.max(a.xMm, b.xMm);
    const y0 = Math.max(a.yMm, b.yMm);
    const x1 = Math.min(a.xMm + a.wMm, b.xMm + b.wMm);
    const y1 = Math.min(a.yMm + a.hMm, b.yMm + b.hMm);
    return { xMm: x0, yMm: y0, wMm: Math.max(0, x1 - x0), hMm: Math.max(0, y1 - y0) };
  };

  const num = i => Number(operands[operands.length - i]);

  const toMm = (x, y) => ({ xMm: x / PT_PER_MM, yMm: (page.heightPt - y) / PT_PER_MM });

  /** Axis-aligned box of the unit square (or a given rect) under `ctm`. */
  const boxOf = (m, rx = 0, ry = 0, rw = 1, rh = 1) => {
    const pts = [
      apply(m, rx, ry),
      apply(m, rx + rw, ry),
      apply(m, rx, ry + rh),
      apply(m, rx + rw, ry + rh),
    ];
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const tl = toMm(x0, y1);
    return {
      xMm: tl.xMm,
      yMm: tl.yMm,
      wMm: (x1 - x0) / PT_PER_MM,
      hMm: (y1 - y0) / PT_PER_MM,
      /* Non-zero b/c means the thing is rotated or skewed. A card must not be. */
      skewed: Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6,
    };
  };

  for (const t of toks) {
    if (/^[-+]?[\d.]+$/.test(t) || t.startsWith('/') || t.startsWith('<<') || t.startsWith('[')) {
      operands.push(t);
      continue;
    }
    switch (t) {
      case 'q':
        stack.push({ ctm, fill, clip });
        break;
      case 'Q': {
        const s = stack.pop();
        if (s) {
          ctm = s.ctm;
          fill = s.fill;
          clip = s.clip;
        }
        break;
      }
      case 'cm':
        ctm = mul([num(6), num(5), num(4), num(3), num(2), num(1)], ctm);
        break;
      case 'rg':
      case 'sc':
      case 'scn':
        if (operands.length >= 3) fill = [num(3), num(2), num(1)];
        break;
      case 'g':
        fill = [num(1), num(1), num(1)];
        break;
      case 're':
        pendingRect = { x: num(4), y: num(3), w: num(2), h: num(1) };
        break;
      case 'W':
      case 'W*':
        pendingClip = true;
        break;
      case 'n':
        if (pendingClip && pendingRect) {
          const box = boxOf(ctm, pendingRect.x, pendingRect.y, pendingRect.w, pendingRect.h);
          clips.push(box);
          clip = intersect(clip, box);
        }
        pendingClip = false;
        pendingRect = null;
        break;
      case 'f':
      case 'F':
      case 'f*':
      case 'b':
      case 'B':
        if (pendingRect) {
          rects.push({
            ...boxOf(ctm, pendingRect.x, pendingRect.y, pendingRect.w, pendingRect.h),
            fill: fill.slice(),
          });
        }
        pendingRect = null;
        break;
      case 'Do': {
        const name = String(operands[operands.length - 1] ?? '').slice(1);
        const res = page.resources[name];
        if (res?.isImage) images.push({ ...boxOf(ctm), name, asset: res, clip });
        break;
      }
      default:
        break;
    }
    if (t !== 're' && t !== 'W' && t !== 'W*') operands.length = 0;
    else operands.length = 0;
  }

  return { images, rects, clips };
}

/** Distinct values in a list of numbers, to `dp` decimals, ascending. */
export function distinct(values, dp = 2) {
  const seen = new Map();
  for (const v of values) {
    const k = v.toFixed(dp);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()].map(([k, n]) => ({ mm: Number(k), n })).sort((a, b) => a.mm - b.mm);
}
