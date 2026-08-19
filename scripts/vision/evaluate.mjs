/**
 * Measure the recognition pipeline, end to end, using the code that ships.
 *
 * Every number in the vision write-up comes from this script. It imports the
 * real `recognizeCard` from `src/lib/vision/`, feeds it decoded JPEG pixels the
 * same way the browser feeds it canvas pixels, and compares the answer against
 * the card the capture was generated from. There is no reimplementation here
 * and no oracle shortcut: detection, rectification, hashing and the layered
 * decision all run for real, against the full-catalogue index.
 *
 * It reports, per condition and per stratum:
 *   * top-1 CARD accuracy (did we name the right card?)
 *   * top-1 PRINTING accuracy (did we name the right row in `cards`?)
 *   * the pipeline's own outcome distribution — resolved / choose / uncertain
 *   * SILENT ERRORS: cases where it said "resolved" and was wrong. This is the
 *     number that actually matters, because it is the only failure the user
 *     cannot see.
 *   * a threshold sweep, so the accept threshold is chosen from data.
 *
 * Usage:
 *   node --experimental-strip-types scripts/vision/evaluate.mjs \
 *       --index <hash-index.bin> --captures <capturedir> --testset <testset.json> \
 *       [--ocr] [--limit n] [--out report.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { CardHashIndex } from '../../src/lib/vision/hashIndex.ts';
import {
  recognizeCard,
  THRESHOLDS,
  hashRectifiedCard,
  rectifyCard,
} from '../../src/lib/vision/recognize.ts';

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const flag = (n) => argv.includes(`--${n}`);

const INDEX_PATH = opt('index');
const CAPTURE_DIR = opt('captures');
const TESTSET = opt('testset');
const OUT = opt('out');
const LIMIT = opt('limit') ? parseInt(opt('limit'), 10) : Infinity;
const USE_OCR = flag('ocr');

if (!INDEX_PATH || !CAPTURE_DIR || !TESTSET) {
  console.error('usage: evaluate.mjs --index <bin> --captures <dir> --testset <json>');
  process.exit(2);
}

console.error('loading index...');
const index = CardHashIndex.fromBytes(new Uint8Array(fs.readFileSync(INDEX_PATH)));
console.error(`index: ${index.size} entries`);

const testset = JSON.parse(fs.readFileSync(TESTSET, 'utf8'));
const meta = new Map(testset.map((r) => [r.id, r]));
const manifest = JSON.parse(fs.readFileSync(path.join(CAPTURE_DIR, 'manifest.json'), 'utf8'));

// Printing identities for the lookup the engine injects. Taken from the test
// set itself, which mirrors what the app would fetch from `cards`.
const identities = new Map(
  testset.map((r) => [r.id, { cardId: r.id, setCode: r.set, collectorNumber: String(r.cn) }]),
);
// siblings may not all be in the test set; pull their identities too
for (const r of testset) {
  for (const sid of r.sibling_ids ?? []) {
    if (!identities.has(sid)) identities.set(sid, null);
  }
}
const missingIdentities = [...identities.entries()].filter(([, v]) => v === null).map(([k]) => k);
if (missingIdentities.length) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  console.error(`fetching ${missingIdentities.length} sibling identities...`);
  // Chunked small and retried: the catalogue sync runs against this database
  // continuously, so a statement timeout mid-run is normal rather than
  // exceptional. A non-array body means PostgREST returned an error object, and
  // iterating it would fail with a misleading TypeError instead of the message.
  for (let i = 0; i < missingIdentities.length; i += 50) {
    const ids = missingIdentities.slice(i, i + 50);
    let rows = null;
    for (let attempt = 0; attempt < 5 && rows === null; attempt++) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/cards?select=id,set_code,collector_number&id=in.(${ids.join(',')})`,
          { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
        );
        const body = await res.json();
        if (Array.isArray(body)) rows = body;
        else console.error(`  identity fetch returned ${res.status}: ${JSON.stringify(body).slice(0, 160)}`);
      } catch (err) {
        console.error(`  identity fetch failed: ${err?.message ?? err}`);
      }
      if (rows === null) await new Promise((r) => setTimeout(r, 750 * 2 ** attempt));
    }
    for (const row of rows ?? []) {
      identities.set(row.id, {
        cardId: row.id,
        setCode: row.set_code,
        collectorNumber: String(row.collector_number),
      });
    }
  }
}

const lookupPrintings = async (cardIds) =>
  cardIds.map((id) => identities.get(id)).filter((x) => x != null);

// ---- OCR, only if asked. Slow, and only the shared-art path needs it. ----
let ocrFn;
let ocrWorker;
if (USE_OCR) {
  const { createWorker } = await import('tesseract.js');
  ocrWorker = await createWorker('eng');
  await ocrWorker.setParameters({
    tessedit_char_whitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz★*',
  });
  ocrFn = async (grayImage) => {
    const png = await sharp(Buffer.from(grayImage.data), {
      raw: { width: grayImage.width, height: grayImage.height, channels: 1 },
    })
      .resize({ width: grayImage.width * 3, kernel: 'lanczos3' })
      .normalise()
      .png()
      .toBuffer();
    const { data } = await ocrWorker.recognize(png);
    return data.text ?? '';
  };
}

// ---- run ----------------------------------------------------------------
const rows = manifest.slice(0, LIMIT);
console.error(`evaluating ${rows.length} captures${USE_OCR ? ' with OCR' : ''}...`);

// A candidate may not be in the test set, so its card identity is resolved via
// the index's oracle grouping rather than the test-set metadata. Memoised: the
// lookup is a linear scan over 50k ids.
const groupCache = new Map();
function truthGroupOf(cardId) {
  if (groupCache.has(cardId)) return groupCache.get(cardId);
  const d = index.distanceTo(cardId, { hi: 0, lo: 0 }, { hi: 0, lo: 0 });
  const g = d?.oracleGroup ?? null;
  groupCache.set(cardId, g);
  return g;
}

const results = [];
let n = 0;
for (const cap of rows) {
  const file = path.join(CAPTURE_DIR, cap.capture);
  if (!fs.existsSync(file)) continue;

  const { data, info } = await sharp(file).removeAlpha().ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const frame = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };

  const t0 = performance.now();
  const res = await recognizeCard(frame, {
    index,
    ocr: ocrFn,
    lookupPrintings,
    maxCandidates: 5,
  });
  const wallMs = performance.now() - t0;

  // The pipeline suppresses candidates past its own review threshold, so
  // res.candidates cannot be used to calibrate that threshold — the sample
  // would be censored exactly where the interesting failures live. Re-run the
  // bare hash search to get the uncensored top-1 distance.
  let rawTop = null;
  const rect = rectifyCard(frame);
  if (rect) {
    const { p, d } = hashRectifiedCard(rect.card);
    rawTop = index.search(p, d, 2)[0] ?? null;
  }

  const truth = cap.truth_card_id;
  const truthMeta = meta.get(truth);
  const truthOracle = truthMeta?.oracle_id;
  const truthGroup = truthGroupOf(truth);

  // "Right card" is judged on oracle identity, not row identity: naming a
  // different printing of the same card is a printing error, not a card error,
  // and conflating them would hide which layer actually failed.
  const top = res.candidates[0] ?? null;
  const topIsRightCard =
    top != null && (meta.get(top.cardId)?.oracle_id ?? null) === truthOracle;

  const topGroupMatches = top != null && truthGroup != null && top.oracleGroup === truthGroup;

  results.push({
    capture: cap.capture,
    condition: cap.condition,
    group: cap.group ?? truthMeta?.group ?? 'unknown',
    truth,
    truthGroupSize: truthMeta?.group_size ?? 1,
    status: res.status,
    confidence: res.confidence,
    resolvedBy: res.resolvedBy,
    resolvedCardId: res.resolvedCardId,
    topCardId: top?.cardId ?? null,
    topPDistance: top?.pDistance ?? null,
    rawTopCardId: rawTop?.cardId ?? null,
    rawTopPDistance: rawTop?.pDistance ?? null,
    rawTopCorrect: rawTop != null && rawTop.oracleGroup === truthGroup,
    topDDistance: top?.dDistance ?? null,
    secondPDistance: res.candidates[1]?.pDistance ?? null,
    cardCorrect: topGroupMatches || topIsRightCard,
    printingCorrect: top?.cardId === truth,
    resolvedCorrect: res.resolvedCardId === truth,
    silentError: res.status === 'resolved' && res.resolvedCardId !== truth,
    candidateContainsTruth: res.candidates.some((c) => c.cardId === truth),
    detected: res.status !== 'no-card',
    qualityState: res.quality.state,
    sharpness: Math.round(res.quality.sharpness),
    offerVisionFallback: res.offerVisionFallback,
    ocrRaw: res.collector?.raw ?? null,
    ocrNumber: res.collector?.collectorNumber ?? null,
    ocrSet: res.collector?.setCode ?? null,
    timings: res.timings,
    wallMs,
  });

  if (++n % 100 === 0) console.error(`  ${n}/${rows.length}`);
}

if (ocrWorker) await ocrWorker.terminate();

// ---- report -------------------------------------------------------------
const pct = (a, b) => (b === 0 ? null : +((100 * a) / b).toFixed(1));

function summarise(subset) {
  const t = subset.length;
  if (t === 0) return null;
  return {
    n: t,
    detected: pct(subset.filter((r) => r.detected).length, t),
    card_top1: pct(subset.filter((r) => r.cardCorrect).length, t),
    printing_top1: pct(subset.filter((r) => r.printingCorrect).length, t),
    truth_in_candidates: pct(subset.filter((r) => r.candidateContainsTruth).length, t),
    resolved: pct(subset.filter((r) => r.status === 'resolved').length, t),
    resolved_correct: pct(subset.filter((r) => r.resolvedCorrect).length, t),
    choose_printing: pct(subset.filter((r) => r.status === 'choose-printing').length, t),
    uncertain: pct(subset.filter((r) => r.status === 'uncertain').length, t),
    no_match: pct(subset.filter((r) => r.status === 'no-match').length, t),
    no_card: pct(subset.filter((r) => r.status === 'no-card').length, t),
    silent_errors: subset.filter((r) => r.silentError).length,
    silent_error_pct: pct(subset.filter((r) => r.silentError).length, t),
    /** Of the scans that produced a committed answer, how many were right. */
    precision_when_resolved: pct(
      subset.filter((r) => r.resolvedCorrect).length,
      subset.filter((r) => r.status === 'resolved').length,
    ),
    avoided_model: pct(subset.filter((r) => !r.offerVisionFallback).length, t),
  };
}

const conditions = [...new Set(results.map((r) => r.condition))];
const groups = [...new Set(results.map((r) => r.group))];

const byCondition = {};
for (const c of conditions) byCondition[c] = summarise(results.filter((r) => r.condition === c));

const byGroup = {};
for (const g of groups) byGroup[g] = summarise(results.filter((r) => r.group === g));

const byGroupCondition = {};
for (const g of groups) {
  byGroupCondition[g] = {};
  for (const c of conditions) {
    const s = summarise(results.filter((r) => r.group === g && r.condition === c));
    if (s) byGroupCondition[g][c] = s;
  }
}

// distance distributions, the basis for the accept threshold
function dist(values) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { n: s.length, min: s[0], p25: at(25), median: at(50), p75: at(75), p95: at(95), max: s[s.length - 1] };
}

const main = results.filter((r) => ['clean', 'mild', 'moderate', 'harsh'].includes(r.condition));

// Uncensored: raw top-1 from the bare hash search, before the pipeline applies
// any threshold. This is what the accept threshold must be calibrated on.
const distances = {
  correct_card: dist(main.filter((r) => r.rawTopCorrect && r.rawTopPDistance != null).map((r) => r.rawTopPDistance)),
  wrong_card: dist(main.filter((r) => !r.rawTopCorrect && r.rawTopPDistance != null).map((r) => r.rawTopPDistance)),
};

const sweep = [];
for (const T of [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 32, 64]) {
  const accepted = main.filter((r) => r.rawTopPDistance != null && r.rawTopPDistance <= T);
  const right = accepted.filter((r) => r.rawTopCorrect).length;
  sweep.push({
    T,
    accepted_pct: pct(accepted.length, main.length),
    card_precision: pct(right, accepted.length),
    wrong_accepted: accepted.length - right,
  });
}

const timing = (() => {
  const all = results.filter((r) => r.timings);
  const sum = (k) => all.reduce((a, r) => a + (r.timings[k] ?? 0), 0) / all.length;
  return {
    n: all.length,
    mean_detect_ms: +sum('detectMs').toFixed(2),
    mean_hash_ms: +sum('hashMs').toFixed(2),
    mean_search_ms: +sum('searchMs').toFixed(2),
    mean_ocr_ms: +sum('ocrMs').toFixed(2),
    mean_total_ms: +sum('totalMs').toFixed(2),
    median_total_ms: +dist(all.map((r) => r.timings.totalMs)).median.toFixed(2),
  };
})();

const report = {
  index_entries: index.size,
  captures_evaluated: results.length,
  ocr_enabled: USE_OCR,
  thresholds: THRESHOLDS,
  overall: summarise(results),
  main_conditions_only: summarise(main),
  by_condition: byCondition,
  by_group: byGroup,
  by_group_and_condition: byGroupCondition,
  distance_distribution: distances,
  threshold_sweep: sweep,
  timing_ms: timing,
  silent_error_detail: results
    .filter((r) => r.silentError)
    .slice(0, 40)
    .map((r) => ({
      capture: r.capture,
      truth: r.truth,
      truthName: meta.get(r.truth)?.name,
      got: r.resolvedCardId,
      gotName: meta.get(r.resolvedCardId)?.name ?? '(not in test set)',
      resolvedBy: r.resolvedBy,
      pDistance: r.topPDistance,
      group: r.group,
    })),
};

console.log(JSON.stringify(report, null, 2));
if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify({ report, results }, null, 1));
  console.error(`wrote ${OUT}`);
}
