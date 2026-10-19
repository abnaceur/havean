#!/bin/sh
# Explicit local GPU opt-in. Run after the driver and local image build succeed.
set -eu
cd "$(dirname "$0")"
docker compose -p haven-gsplat-probe -f compose.gsplat-probe.yaml run --rm gpu-probe
gpu_device=$(nvidia-smi --query-gpu=uuid --format=csv,noheader)
case "$gpu_device" in GPU-*) ;; *) echo 'One actual NVIDIA device is required.' >&2; exit 1 ;; esac
DIGITIZATION_GPU_IMAGE=$(docker image inspect haven-gsplat:1.5.3-torch2.7.1-cu126-sm75-investigation-v1 --format '{{.Id}}')
case "$DIGITIZATION_GPU_IMAGE" in sha256:*) ;; *) echo 'Immutable local image required.' >&2; exit 1 ;; esac
export DIGITIZATION_GPU_IMAGE PROCESSING_ENABLE_GSPLAT_INVESTIGATION=true
docker compose exec -T api node <<'JS'
const fs=require('fs'),crypto=require('crypto'),file='infra/generated/digitization-gpu.key';
if(!fs.existsSync(file)){fs.writeFileSync(file,crypto.randomBytes(48),{mode:0o640,flag:'wx'});fs.chownSync(file,1000,1000);}
const key=fs.readFileSync(file);if(key.length<32||key.length>256)throw Error('Invalid separate GPU key');
JS
compose_gpu(){ docker compose -f compose.yaml -f compose.digitization.yaml -f compose.ocr-development.yaml -f compose.camera-development.yaml -f compose.gsplat-investigation.yaml --profile gsplat-investigation "$@"; }
compose_gpu up -d --wait --pull never processing-gpu
compose_gpu up -d --no-deps --wait --pull never api
compose_gpu exec -T api pnpm exec tsx scripts/gsplat-register-local-device.ts "$gpu_device"
printf 'DIGITIZATION_GPU_IMAGE=%s\nPROCESSING_ENABLE_GSPLAT_INVESTIGATION=true\n' "$DIGITIZATION_GPU_IMAGE" > infra/generated/gsplat-runtime.env
echo 'Private local gsplat runner activated; publication still requires independent review.'
