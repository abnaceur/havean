#!/bin/sh
set -eu
# High-resolution input pixels are preserved; this is asset preparation only.
for part in ${CAPTURE_CLIP_PARTS:-0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16}; do
 offset=$((part * 12))
 docker compose -f compose.2bhk-assets.yaml run --rm encode -y -framerate 1 -start_number "$offset" -i /assets/frame%03d.png -t 12 -vf fps=12 -filter_threads 1 -c:v libx264 -threads 2 -crf 20 -bf 0 -g 12 -pix_fmt yuv420p -movflags +faststart "/assets/part-$part.mp4"
done
