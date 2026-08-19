"""Generate simulated phone captures of real card images, for evaluating the
recognition pipeline.

This script ONLY produces photographs. It does no recognition, computes no
hashes and knows nothing about the index — all of that happens in JavaScript,
in `evaluate.mjs`, using the exact code that ships. Keeping the two apart is
what stops the evaluation from accidentally testing a Python reimplementation of
the thing we actually run.

WHAT THIS IS NOT. These are simulated degradations, not photographs. It applies
perspective, rotation, framing error, defocus, exposure and white-balance shift,
sensor noise, JPEG artefacts and a specular highlight. It does NOT reproduce:
true lens distortion, rolling shutter, motion blur streaks, real foil rainbow
diffraction, card wear, sleeve texture, or the colour response of a real sensor.
The source renders are also only 672x936, which carries less detail than a
modern phone camera. Accuracy measured here should be treated as indicative and
re-derived from real photographs before any threshold is treated as final.

Usage: python scripts/vision/make-captures.py <testset.json> <imgdir> <outdir> [conditions]
"""
import json, sys, os, zlib
import numpy as np
import cv2
from PIL import Image

# Degradation presets, in increasing severity. The parameter values were chosen
# to bracket what a phone held over a table actually does, not to make the
# numbers look good -- "harsh" is deliberately past the point of usefulness so
# the failure mode can be observed.
CONDITIONS = {
    'clean':    dict(angle=0.0,  persp=0.00, blur=0.0, bright=1.00, glare=0.00, jpeg_q=95, crop_err=0.00, noise=0.0),
    'mild':     dict(angle=3.0,  persp=0.01, blur=0.6, bright=0.95, glare=0.05, jpeg_q=88, crop_err=0.01, noise=1.5),
    'moderate': dict(angle=8.0,  persp=0.03, blur=1.4, bright=0.85, glare=0.12, jpeg_q=78, crop_err=0.02, noise=3.5),
    'harsh':    dict(angle=15.0, persp=0.06, blur=2.4, bright=0.70, glare=0.22, jpeg_q=65, crop_err=0.04, noise=6.0),
    # single-axis probes, to attribute failures to a cause
    'blur_only':   dict(angle=0.0,  persp=0.00, blur=2.0, bright=1.00, glare=0.00, jpeg_q=95, crop_err=0.00, noise=0.0),
    'glare_only':  dict(angle=0.0,  persp=0.00, blur=0.0, bright=1.00, glare=0.25, jpeg_q=95, crop_err=0.00, noise=0.0),
    'rot30':       dict(angle=30.0, persp=0.00, blur=0.0, bright=1.00, glare=0.00, jpeg_q=95, crop_err=0.00, noise=0.0),
    'oblique':     dict(angle=5.0,  persp=0.08, blur=0.0, bright=1.00, glare=0.00, jpeg_q=95, crop_err=0.00, noise=0.0),
    'dim':         dict(angle=0.0,  persp=0.00, blur=0.0, bright=0.45, glare=0.00, jpeg_q=95, crop_err=0.00, noise=4.0),
}

WB = {
    'clean': (1.0, 1.0, 1.0),
    'mild': (1.03, 1.0, 0.97),
    'moderate': (1.08, 1.0, 0.93),
    'harsh': (1.14, 1.0, 0.88),
}


def simulate(card_rgb, *, angle, persp, blur, bright, wb, glare, jpeg_q, crop_err, noise,
             out_w=900, rng=None):
    rng = rng or np.random.default_rng(0)
    h, w = card_rgb.shape[:2]

    pad = int(max(w, h) * 0.35)
    W, H = w + 2 * pad, h + 2 * pad
    bg_val = rng.integers(60, 150)
    canvas = np.full((H, W, 3), bg_val, np.uint8)
    tex = rng.normal(0, 8, (H, W, 1)).astype(np.float32)
    canvas = np.clip(canvas.astype(np.float32) + tex, 0, 255).astype(np.uint8)
    canvas[pad:pad + h, pad:pad + w] = card_rgb

    corners = np.float32([[pad, pad], [pad + w, pad], [pad + w, pad + h], [pad, pad + h]])

    if persp > 0:
        jit = rng.uniform(-persp, persp, (4, 2)) * np.float32([w, h])
        dst = (corners + jit).astype(np.float32)
    else:
        dst = corners.copy()
    M = cv2.getPerspectiveTransform(corners, dst)
    canvas = cv2.warpPerspective(canvas, M, (W, H), borderMode=cv2.BORDER_REPLICATE)
    corners = dst

    if angle != 0.0:
        R = cv2.getRotationMatrix2D((W / 2, H / 2), angle, 1.0)
        canvas = cv2.warpAffine(canvas, R, (W, H), borderMode=cv2.BORDER_REPLICATE)
        corners = (np.hstack([corners, np.ones((4, 1), np.float32)]) @ R.T).astype(np.float32)

    if crop_err > 0:
        dx, dy = rng.uniform(-crop_err, crop_err, 2) * np.float32([W, H])
        zoom = 1.0 + rng.uniform(-crop_err, crop_err)
        T = np.float32([[zoom, 0, dx], [0, zoom, dy]])
        canvas = cv2.warpAffine(canvas, T, (W, H), borderMode=cv2.BORDER_REPLICATE)
        corners = (np.hstack([corners, np.ones((4, 1), np.float32)]) @ T.T).astype(np.float32)

    img = canvas.astype(np.float32)

    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    grad = 1.0 + 0.18 * ((gx / W - 0.5) + (gy / H - 0.5))
    img *= grad[..., None]
    img *= bright
    img *= np.float32(wb)[None, None, :]

    if glare > 0:
        cx, cy = rng.uniform(0.25, 0.75) * W, rng.uniform(0.2, 0.7) * H
        rx, ry = W * rng.uniform(0.14, 0.30), H * rng.uniform(0.08, 0.20)
        m = np.exp(-(((gx - cx) / rx) ** 2 + ((gy - cy) / ry) ** 2))
        img += (glare * 255.0) * m[..., None]

    img = np.clip(img, 0, 255)
    if blur > 0:
        k = int(blur * 4) | 1
        img = cv2.GaussianBlur(img, (k, k), blur)
    if noise > 0:
        img += rng.normal(0, noise, img.shape)
    img = np.clip(img, 0, 255).astype(np.uint8)

    scale = out_w / W
    img = cv2.resize(img, (out_w, int(H * scale)), interpolation=cv2.INTER_AREA)
    corners = corners * scale
    ok, enc = cv2.imencode('.jpg', cv2.cvtColor(img, cv2.COLOR_RGB2BGR),
                           [int(cv2.IMWRITE_JPEG_QUALITY), int(jpeg_q)])
    img = cv2.cvtColor(cv2.imdecode(enc, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
    return img, corners


def main():
    testset_path, imgdir, outdir = sys.argv[1:4]
    wanted = sys.argv[4].split(',') if len(sys.argv) > 4 else ['clean', 'mild', 'moderate', 'harsh']

    rows = json.load(open(testset_path, encoding='utf8'))
    os.makedirs(outdir, exist_ok=True)

    manifest = []
    for cond in wanted:
        params = dict(CONDITIONS[cond])
        params['wb'] = WB.get(cond, (1.0, 1.0, 1.0))
        cdir = os.path.join(outdir, cond)
        os.makedirs(cdir, exist_ok=True)
        for i, r in enumerate(rows):
            src = os.path.join(imgdir, r['id'] + '.jpg')
            if not os.path.exists(src):
                continue
            card = np.array(Image.open(src).convert('RGB'))
            # deterministic per (card, condition) so runs are reproducible.
            # crc32, not hash(): Python randomises string hashing per process,
            # which would silently make every run use different degradations.
            rng = np.random.default_rng(zlib.crc32(f"{r['id']}|{cond}".encode()))
            photo, corners = simulate(card, rng=rng, **params)
            dest = os.path.join(cdir, r['id'] + '.jpg')
            Image.fromarray(photo).save(dest, quality=92)
            manifest.append({
                'capture': os.path.relpath(dest, outdir).replace('\\', '/'),
                'condition': cond,
                'truth_card_id': r['id'],
                'name': r.get('name'),
                'set': r.get('set'),
                'cn': r.get('cn'),
                'group': r.get('group'),
                'group_size': r.get('group_size'),
                'true_corners': corners.tolist(),
            })
        print(f'{cond}: {len([m for m in manifest if m["condition"] == cond])} captures', flush=True)

    json.dump(manifest, open(os.path.join(outdir, 'manifest.json'), 'w'), indent=1)
    print(json.dumps({'captures': len(manifest), 'conditions': wanted}))


if __name__ == '__main__':
    main()
