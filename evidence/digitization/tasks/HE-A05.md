# HE-A05 — CPU/GPU development profiles (in progress)

## Acceptance

Not accepted. HE-A05-CPU has its separate accepted startup/readiness evidence. HE-A05-GPU remains unfinished; a working NVIDIA driver and the required bounded GPU runtime checks are absent. CPU results and compiled CUDA libraries do not satisfy the GPU prerequisite.

## O

Existing local Compose services, authored CPU fixtures and actual host/build inspection. No customer property or physical VR evidence.

## R

Preserved ordered HE-A05 prerequisites, private runner networking, bounded resources and exact dependency/image pins. See [CPU child evidence](HE-A05-CPU.md) and [current blockers](/home/abn/project/real-estate-solution/docs/digitization/BLOCKERS.md).

## P

The isolated CPU test image now uses `haven-processing-tests-cpu:1.0.0-cpu-v1`, replacing the implicit local tag. The protocol runner resolves that image to its actual local digest before starting the bounded private container. The processing license gate permits this alias only for the declared local test recipe/target; production admission, a different recipe or importing the alias in another Compose service are rejected. Sixteen license guards pass; the versioned image build succeeds (`versioned-cpu-manifest-image-build.log`). Runtime dependency images and all recipe base images retain their approved digests.

## V

Latest CPU regression:108 actual checks (`native-document-source-binding-cpu-regression.log`). The parent stays in progress. GPU startup, CUDA runtime inference and complete HE-A05 acceptance remain pending. No GPU capacity or whole-engine completion is claimed.
