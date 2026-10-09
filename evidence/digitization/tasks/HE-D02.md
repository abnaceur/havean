# HE-D02 — real PaddleOCR CPU investigation (in progress)

## O
Self-authored synthetic English/French/Arabic images only. Arabic fixture uses the existing application SVG renderer for proper shaping. The user selected Abu Dhabi as the immediate geographic target; no customer documents, real capture dataset or working GPU/headset were supplied.

## R
A real locale-aware worker must produce nonempty source-linked tokens from authorized Arabic/French/English fixtures. Exact dependency/model/native licensing, bounded isolation and API-owned authority/result commits remain mandatory. Country profiles require independent labeled holdouts; model scores do not constitute accuracy or parity approval.

## P
Resolved 63 exact binary wheels; PyPI release hashes verified. Downloaded/reverified 20 official model files from four immutable publisher revisions. Offline CPU probes run PaddleOCR 3.3.3, PaddlePaddle 3.2.2 and PaddleX 3.3.13 with local model directories and all orientation/unwarping downloads disabled. Real output includes source SHA256, page, normalized polygon, raw recognized text and native score for all three languages. Models remain absent from the enabled runtime manifest. Scratch wheels/models/probe image are ignored and are not production dependencies.

## V
Passed real investigation: `evidence/digitization/ocr-three-locale-shaped-final-probe.log`. The Arabic quantity is misrecognized; this explicitly is not a correct quantity or a successful Abu Dhabi benchmark. French accents/superscript are also imperfect. Preserve raw output and require review/abstention; do not publish or auto-post it.
Exact candidate provenance: `evidence/digitization/ocr-investigation-pins.json`. Native-wheel/system-library distribution license audit, hardened worker integration and authenticated API token persistence remain pending. Therefore HE-D02 is not accepted. Earlier import/fixture failures remain in the OCR probe logs.
