"""Emit OpenCV-computed hashes for a sample of card images, as the reference
the JavaScript implementation must reproduce.

This exists because the index is built in Node and queried in a browser, while
the accuracy this pipeline is calibrated against was measured with OpenCV. If
the JS and OpenCV hashes ever diverge, the calibration silently stops applying.
`verify-hash-parity.mjs` reads this file and asserts equality.

Usage: python scripts/vision/parity-reference.py <imgdir> <out.json> [n]
"""
import json, sys, os
import numpy as np
import cv2
from PIL import Image

ART_WINDOW = (0.0804, 0.1143, 0.9196, 0.5534)


def gray_resize(img, w, h):
    if img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    return cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)


def _pack(bits):
    v = 0
    for b in bits:
        v = (v << 1) | int(bool(b))
    return v


def dhash(img):
    g = gray_resize(img, 9, 8)
    return _pack((g[:, 1:] > g[:, :-1]).flatten())


def phash(img):
    g = gray_resize(img, 32, 32)
    d = cv2.dct(g)
    low = d[:8, :8].flatten()
    med = np.median(low[1:])
    return _pack(low > med)


def art_crop(img):
    h, w = img.shape[:2]
    x0, y0, x1, y1 = ART_WINDOW
    return img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]


imgdir, outpath = sys.argv[1:3]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 200

files = sorted(f for f in os.listdir(imgdir) if f.endswith('.jpg'))
# spread the sample across the whole directory rather than taking a prefix,
# so we are not just testing one alphabetical corner of the catalogue
step = max(1, len(files) // n)
files = files[::step][:n]

out = []
for f in files:
    img = np.array(Image.open(os.path.join(imgdir, f)).convert('RGB'))
    a = art_crop(img)
    out.append({
        'id': f[:-4],
        'width': img.shape[1], 'height': img.shape[0],
        'whole_p': f'{phash(img):016x}',
        'whole_d': f'{dhash(img):016x}',
        'art_p': f'{phash(a):016x}',
        'art_d': f'{dhash(a):016x}',
        # intermediate, so a mismatch can be localised to resize vs dct vs pack
        'gray32_checksum': int(gray_resize(img, 32, 32).astype(np.int64).sum()),
        'art_gray32_checksum': int(gray_resize(a, 32, 32).astype(np.int64).sum()),
    })

json.dump(out, open(outpath, 'w'), indent=1)
print(json.dumps({'reference_rows': len(out), 'out': outpath}))
