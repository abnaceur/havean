# OCR dependency review — 6 October 2026

This is an adoption review, not an enabled OCR implementation or benchmark.

The official PyPI PaddlePaddle 3.3.1 CPython 3.12 Linux x86-64 CPU wheel was downloaded to the external `/tmp/haven-ocr-research` research directory. Its complete 194,839,332 bytes have SHA-256 `9016fc497213e1101261684321fbb31ef5960019ef39cb07ded27bc70e2a9858`, matching the official artifact metadata. It is not installed, included in CPU images, added to processing locks or enabled at runtime.

Wheel version metadata pins source commit `7688495538f4d6c1893f084dd238a402e8f68ab6`; the official `v3.3.1` Git ref independently matches that commit. Metadata reports a CPU build with MKL on and CUDA/CUDNN false. The root wheel LICENSE is Apache-2.0. That license alone does not cover all bundled native dependencies.

The wheel contains MKLML, Intel OpenMP, oneDNN, OpenVINO and its CPU/Paddle frontend plugins, TBB, BLAS/LAPACK, GNU Fortran/quadmath, warp-CTC/RNNT and Paddle libraries. The inspected archive exposes one root license file rather than a complete third-party notice inventory. Each embedded binary needs its version/hash, matching upstream license/redistribution notices and applicable runtime exception terms before adoption. The pinned source's `cmake/external/mklml.cmake` references the 2019.0.5 csrmm archive; its HTTP/MD5 build reference is not an acceptable production artifact pin. A separately verified HTTPS archive/checksum and binary match are required if that build is retained.

Python dependencies also require exact compatible wheel hashes and license records: httpx, numpy, protobuf, opt_einsum 3.3.0, networkx, typing_extensions, safetensors and setuptools, plus their actual transitive requirements. Existing Pillow stays pinned unless measured compatibility requires a change.

The official Arabic PP-OCRv3 recognition model card declares Apache-2.0, but recognition alone is not document text detection or full page OCR. Arabic/French/English detector/recognizer configurations, dictionaries and weights must each be pinned by immutable source revision/checksum, then tested on actual authorized or authored raster fixtures. Production downloads remain disabled. Missing representative country examples keep UAE/Algerian automatic profiles disabled.

Primary references: [official wheel metadata](https://pypi.org/project/paddlepaddle/3.3.1/), [pinned source](https://github.com/PaddlePaddle/Paddle/tree/7688495538f4d6c1893f084dd238a402e8f68ab6), [official Arabic model](https://huggingface.co/PaddlePaddle/arabic_PP-OCRv3_mobile_rec).

O: no customer documents. R: exact official artifact/source metadata and inspected wheel contents. P: complete download/checksum and archive inspection. V: no OCR adoption, accuracy benchmark, country enablement or GPU acceptance.
