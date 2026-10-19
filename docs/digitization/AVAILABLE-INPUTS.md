## Real GPU reconstruction generated — 13 October 2026 (O/R/P/V)

O/R: user authorized GPU use and local driver repair; credentials stayed in sudo. P: NVIDIA595.99.02/DKMS now runs on GTX1650Ti4GiB without reboot. A pinned gsplat1.5.3/torch2.7.1+cu126 SM75 runtime is active on the private development runner. The agent action completed actual500-step training and private export from the licensed16-view reference capture:3,354 splats,18.5575 seconds including held-out evaluation/export, no OOM fallback. A weights-only load verifies the500-step checkpoint and finite parameters. Both107,328-byte viewer tiers and188,184-byte PLY are nonempty and checksummed. The real browser journey passes download, orbit, zoom and reset. Evidence: `evidence/digitization/gsplat-real-functional.md` and `gsplat-real-result.json`.

P: fixed real CUDA sandbox startup, job-local export moves, temporary-file ordering, the missing native-loader dependency and overly large uniform splat initialization. Local-neighbour sizing makes captured desk objects recognizable in held-out renders; preview framing now avoids distant outliers. View as Agent Demo: http://localhost:8089/ops/digitization?workspace=9acf2520-a922-4b23-830e-0a55aa0b97a6#digitization-scene and open the scene preview.

V: this is a rough partial reference desk-area scan, not the authored apartment or a complete furnished property/metric floor plan. No independent render/privacy approval, public publication, editable furniture inference, production/native distribution admission or full GPU fault/recovery acceptance. VR remains paused. HE-H06's exact real-checkpoint/scene minimum passes; task remains in_progress because prerequisite HE-H03 is unfinished. Counts unchanged: root120/120, engine56/95,37 unfinished non-VR plus2pausedVR. Older blocked/deferred notes below are historical and superseded by this update.

## GPU use authorized; host driver repair required — 13 October 2026 (O/R/P/V)

O/R: user now explicitly requested “use the GPU”, lifting the previous GPU-validation deferral. VR remains paused. P: actual host and Docker device checks attempted. The GTX1650Ti Mobile PCI device is present, but running kernel7.0.0-34-generic has no NVIDIA module. Driver595.84 and its module exist for older kernel7.0.0-31; current-kernel package595.91.07 is available. The Docker NVIDIA runtime exists but fails device admission. `sudo -n true` requires a password. Existing unrelated baidunetdisk dependencies also block APT; a simulated repair installs six libraries with no removals. Prepared `scripts/repair-gsplat-gpu-host.sh` for interactive local sudo, dependency repair, current-kernel driver installation and modprobe; it refuses removals and does not reboot. User was asked to run it locally without sharing their password.

V: GPU work is authorized, not deferred, but remains blocked by host administrator access. No CUDA/training success, runtime build, completed scene, GPU acceptance or public-property replacement is claimed. Evidence: `evidence/digitization/gsplat-host-admission.json`, `gsplat-device-probe.log`, `gsplat-host-package-repair-preview.log`. After repair run `docker compose -f compose.gsplat-probe.yaml run --rm gpu-probe`, then prepare the pinned gsplat runtime and execute the real calibrated fixture. Task counts unchanged: root120/120, engine56/95;37 non-VR unfinished and2pausedVR.

## gsplat integration update — 13 October 2026 (O/R/P/V)

O/R: user retained GPU-validation deferral and paused VR. P: durable calibrated-input binding, background training/export jobs, private output collection, cancellation/resource fencing and agent status are implemented; minimum CPU/API/browser checks pass. See `evidence/digitization/gsplat-integration.md` and `docs/runbooks/gsplat-investigation.md`. This supersedes older statements that the durable gsplat connection is missing. V: no GPU runtime build, setup, CUDA training, actual trained-property result or production/native admission. Exact GPU acceptance remains pending; engine56/95 and37 unfinished non-VR tasks are unchanged.

# Available inputs — 6 October 2026

## Local observation
NVIDIA PCI display 0000:01:00.0 (10de:1f95) exists, without a bound driver. nvidia-smi exits 9; usable VRAM and CUDA runtime execution are unverified. Intel display is bound to i915. USB products identify a fingerprint reader and integrated webcam; no headset identified. Docker has an NVIDIA runtime and cached CUDA images, which do not establish functioning GPU execution.

No capture/model directories were found at /home/abn/datasets, /data, /mnt/data or /opt/models. Repository media search found packages/test-support/assets/property-demo.mp4, a synthetic fixture, but no real reconstruction capture or labeled country documents. No customer documents were opened. Synthetic fixture videos cannot satisfy HE-H/K reconstruction acceptance.

## Public candidates
[PaddlePaddle Arabic PP-OCRv3 model card](https://huggingface.co/PaddlePaddle/arabic_PP-OCRv3_mobile_rec/blob/main/README.md) declares Apache-2.0 and supports Arabic text-line recognition. This is a candidate for the OCR adapter, not a deed benchmark or installed/approved model. Exact snapshot, weight hashes, detection model, Python/CPU compatibility, dependency licenses and actual Arabic/French/English fixture results remain required before enabling. No weights are enabled in the processing manifest.

[COLMAP official sample datasets](https://github.com/colmap/colmap/blob/main/doc/datasets.rst) provide reconstruction sample download leads. The dataset listing does not establish a commercial license for the images; they are not adopted yet. Code licensing is separate from capture licensing. Country documents need independently labeled representative authorized examples, not arbitrary internet deeds. A working supported headset/browser must be tested physically before enabling a working VR badge.

## Evidence
O: local device/directory inventory only. R: linked primary publisher pages and supplied acceptance gates. P: exact local availability findings recorded in BLOCKERS.md. V: no GPU, headset, country profile or real reconstruction acceptance.

P: The official PaddlePaddle 3.3.1 CPU wheel is now fully downloaded and checksum-verified outside the repository. It is not installed/enabled; bundled native license/version inventory and model/locale fixtures remain required. See OCR-DEPENDENCY-REVIEW.md. PDFium rasterization and real source transport are available CPU components, but no real OCR draft is claimed.


## User clarification: generic documents and host resources — 10 October 2026

The user specified using the local host and extracting facts from documents without requiring a particular country template; unavailable facts must remain unfilled. Generic extraction now has explicit v3 evidence-backed English/French/Arabic text fields (country/region/city/district/address/property type/tenure/owner/boundary), string identifiers preserving leading zeros, and explicit standalone count phrases in flexible line/semicolon layouts. Original quote/page/crop and pending review remain attached. Blank/unknown/n/a fields and unlabeled numbers do not generate candidates. The API independently rechecks each normalized value against actual retained native/OCR text and refuses version substitution or invented text. No document author claim creates owner authority or canonical geography automatically.

Current host inventory: Intel i9-10885H,16 logical CPU threads,62 GiB RAM, and NVIDIA GTX1650Ti Mobile PCI device. The running kernel is7.0.0-34-generic and `modinfo nvidia` reports no module; `nvidia-smi` cannot communicate with a driver. CPU workers run on the existing host through bounded Compose services. This is a missing usable CUDA driver/runtime, not an absent physical GPU. No kernel/driver installation, hardware device acceptance or GPU processing result is claimed.

No special document template or representative country upload is required for the generic extraction/review/private draft path. Representative country/property fixtures remain acceptance inputs for disabled specialized profiles and physical reconstruction benchmarks only. Mandatory canonical unit fields remain blank in the intake until explicitly supplied; creating a canonical unit without them would require invented values and is blocked.

O: user's latest clarification, actual host CPU/RAM/PCI/driver probes and retained actual document text. R: format-independent supported-document extraction with unknowns omitted, exact source evidence and host resource limits. P: generic v3 implementation, actual native-PDF parsing and strict API validation. V: current CUDA driver unavailable; GPU/headset, specialized benchmark/admission and downstream software acceptance remain pending.
