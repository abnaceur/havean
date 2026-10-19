#!/usr/bin/env bash
# Host driver repair only. Run interactively so sudo credentials stay local.
# Replaces only the two obsolete NVIDIA module packages diagnosed below.
# Does not reboot, remove applications, change Docker settings or start training.
set -euo pipefail
gpu_kernel=$(uname -r)
if [[ "$gpu_kernel" != '7.0.0-34-generic' ]]; then
  echo 'Kernel changed since diagnosis; recheck the matching NVIDIA package first.' >&2
  exit 1
fi
if nvidia-smi --query-gpu=name,driver_version --format=csv,noheader; then
  exit 0
fi
sudo -v
sudo apt-get update
# The existing baidunetdisk dependency problem blocks unrelated APT installs.
# --no-remove refuses any repair that would remove an installed application.
sudo apt-get --no-remove --fix-broken install -y
gpu_packages=(nvidia-driver-595-open nvidia-dkms-595-open "linux-headers-${gpu_kernel}" linux-modules-nvidia-595-open-generic-hwe-24.04-)
# Ubuntu's current precompiled module requires an older userspace driver than
# the repository now serves. DKMS builds the matching driver for this kernel.
gpu_plan=$(LC_ALL=C apt-get --simulate --no-install-recommends install "${gpu_packages[@]}")
printf '%s\n' "$gpu_plan"
while read -r gpu_removed; do
  case "$gpu_removed" in
    linux-modules-nvidia-595-open-7.0.0-31-generic|linux-modules-nvidia-595-open-generic-hwe-24.04) ;;
    *) echo "Unexpected package removal refused: $gpu_removed" >&2; exit 1 ;;
  esac
done < <(printf '%s\n' "$gpu_plan" | awk '$1 == "Remv" { print $2 }')
sudo apt-get --no-install-recommends install -y "${gpu_packages[@]}"
sudo modprobe nvidia
sudo modprobe nvidia_uvm
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
