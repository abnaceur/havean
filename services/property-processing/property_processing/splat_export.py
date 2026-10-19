"""Bounded private export of gsplat's uncompressed float32 PLY layout.

Independent format implementation; no CUDA, training, scale or viewer acceptance
is implied. The 32-byte .splat tier discards directional spherical harmonics.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import stat
import struct
import tempfile

MAX_SOURCE_BYTES = 100 * 1024**2
MAX_VERTICES = 2_000_000
MOBILE_BYTES = 25 * 1024**2 - 32
DESKTOP_BYTES = 100 * 1024**2 - 32
SH_C0 = 0.28209479177387814


def _header(stream, size):
    lines, consumed = [], 0
    while consumed < 65536:
        raw = stream.readline(65536 - consumed + 1)
        consumed += len(raw)
        if not raw or consumed > 65536:
            raise ValueError('Bounded terminated PLY header required')
        try:
            line = raw.decode('ascii').strip()
        except UnicodeDecodeError as error:
            raise ValueError('ASCII PLY header required') from error
        if line == 'end_header':
            break
        if not line.startswith('comment '):
            lines.append(line)
    else:
        raise ValueError('Bounded terminated PLY header required')
    if len(lines) < 3 or lines[:2] != ['ply', 'format binary_little_endian 1.0']:
        raise ValueError('Uncompressed little-endian float32 PLY required')
    words = lines[2].split()
    if len(words) != 3 or words[:2] != ['element', 'vertex'] or not words[2].isascii() or not words[2].isdigit():
        raise ValueError('Single vertex element required')
    count = int(words[2])
    if not 1 <= count <= MAX_VERTICES:
        raise ValueError('Nonempty bounded scene required')
    names = []
    for line in lines[3:]:
        words = line.split()
        if len(words) != 3 or words[:2] != ['property', 'float']:
            raise ValueError('Only canonical float32 vertex attributes supported')
        names.append(words[2])
    rest = len(names) - 14
    if rest not in (0, 9, 24, 45):
        raise ValueError('Spherical harmonic degree zero through three required')
    expected = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2'] + [f'f_rest_{i}' for i in range(rest)] + ['opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
    if names != expected or size != consumed + count * len(names) * 4:
        raise ValueError('Exact canonical attribute order and payload length required')
    return count, rest, struct.Struct('<' + 'f' * len(names))


def _vertex(values, rest):
    if not all(math.isfinite(v) for v in values):
        raise ValueError('Finite scene attributes required')
    position, harmonics = values[:3], values[3:6 + rest]
    opacity = values[6 + rest]
    scales, rotation = values[7 + rest:10 + rest], values[10 + rest:14 + rest]
    if any(abs(v) > 1e6 for v in position) or any(abs(v) > 100 for v in harmonics) or abs(opacity) > 80 or any(not -30 <= v <= 12 for v in scales):
        raise ValueError('Scene coordinate, harmonic, opacity or scale limit exceeded')
    norm = math.sqrt(sum(v * v for v in rotation))
    if not 1e-8 <= norm <= 1e8:
        raise ValueError('Nonzero bounded quaternion required')
    # gsplat quaternions and this splat layout both use w,x,y,z.
    colours = [max(0, min(255, round((SH_C0 * v + .5) * 255))) for v in values[3:6]]
    alpha = round(255 / (1 + math.exp(-opacity)))
    quaternions = [max(0, min(255, round(v / norm * 128 + 128))) for v in rotation]
    return struct.pack('<6f8B', *position, *(math.exp(v) for v in scales), *colours, alpha, *quaternions)


def export_private_tiers(source, output, *, mobile_bytes=MOBILE_BYTES, desktop_bytes=DESKTOP_BYTES):
    """Validate every vertex, then expose a new private local package.

    Outputs are not API artifacts or publication approval. Uniform sampling is
    deterministic and explicitly reported; it makes no visual quality promise.
    """
    if type(mobile_bytes) is not int or type(desktop_bytes) is not int or not 32 <= mobile_bytes <= MOBILE_BYTES or not mobile_bytes <= desktop_bytes <= DESKTOP_BYTES:
        raise ValueError('Bounded ordered viewer byte budgets required')
    output = Path(output)
    if output.exists() or output.is_symlink() or not output.parent.is_dir() or output.parent.is_symlink():
        raise ValueError('New output directory under a regular private parent required')
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    temporary = None
    try:
        with os.fdopen(fd, 'rb') as stream:
            original = os.fstat(stream.fileno())
            if not stat.S_ISREG(original.st_mode) or not 1 <= original.st_size <= MAX_SOURCE_BYTES:
                raise ValueError('Bounded regular private PLY required')
            count, rest, record = _header(stream, original.st_size)
            temporary = Path(tempfile.mkdtemp(prefix='.splat-export-', dir=output.parent))
            targets = {'mobile': min(count, mobile_bytes // 32), 'desktop': min(count, desktop_bytes // 32)}
            bounds_min, bounds_max = [math.inf] * 3, [-math.inf] * 3
            digests = {tier: hashlib.sha256() for tier in targets}
            opacity_range = [255, 0]
            with (temporary / 'mobile.splat').open('xb') as mobile, (temporary / 'desktop.splat').open('xb') as desktop:
                for index in range(count):
                    body = stream.read(record.size)
                    if len(body) != record.size:
                        raise ValueError('Truncated scene payload')
                    values = record.unpack(body)
                    exported = _vertex(values, rest)
                    for axis in range(3):
                        bounds_min[axis] = min(bounds_min[axis], values[axis])
                        bounds_max[axis] = max(bounds_max[axis], values[axis])
                    opacity_range = [min(opacity_range[0], exported[27]), max(opacity_range[1], exported[27])]
                    for tier, destination in [('mobile', mobile), ('desktop', desktop)]:
                        target = targets[tier]
                        if (index + 1) * target // count > index * target // count:
                            destination.write(exported)
                            digests[tier].update(exported)
            if any(low >= high for low, high in zip(bounds_min, bounds_max)) or opacity_range[1] == 0:
                raise ValueError('Nondegenerate visible scene required')
            stream.seek(0)
            source_digest = hashlib.sha256()
            with (temporary / 'full.ply').open('xb') as full:
                remaining = original.st_size
                while remaining:
                    body = stream.read(min(65536, remaining))
                    if not body:
                        raise ValueError('Scene changed during export')
                    full.write(body)
                    source_digest.update(body)
                    remaining -= len(body)
            current = os.fstat(stream.fileno())
            if (current.st_size, current.st_mtime_ns, current.st_ctime_ns) != (original.st_size, original.st_mtime_ns, original.st_ctime_ns):
                raise ValueError('Scene changed during export')
            degree = {0: 0, 9: 1, 24: 2, 45: 3}[rest]
            manifest = {'schemaVersion': 1, 'formatProfile': 'gsplat-uncompressed-ply-float32-v1',
                        'source': {'file': 'full.ply', 'sha256': source_digest.hexdigest(), 'byteSize': str(original.st_size), 'splatCount': count, 'sphericalHarmonicDegree': degree},
                        'bounds': {'min': bounds_min, 'max': bounds_max}, 'quaternionOrder': 'wxyz',
                        'coordinateTransform': None, 'scale': None, 'unit': 'arbitrary', 'roomCoverage': None,
                        'tiers': [{'id': tier, 'file': tier + '.splat', 'format': 'splat', 'byteSize': str(target * 32),
                                   'sha256': digests[tier].hexdigest(), 'splatCount': target, 'sphericalHarmonicDegree': 0,
                                   'sampling': 'all' if target == count else 'deterministic_uniform', 'sourceSplatCount': count}
                                  for tier, target in targets.items()],
                        'limitations': ['Viewer tiers discard directional spherical harmonics.', 'Uniformly reduced tiers require human render review.', 'Scale, room coverage, orientation in a floor plan and device performance are unverified.'],
                        'reviewRequired': True, 'viewerValidated': False, 'publiclyServed': False}
            (temporary / 'manifest.json').write_text(json.dumps(manifest, allow_nan=False, indent=2) + '\n')
            for path in temporary.iterdir():
                path.chmod(0o600)
            # Never replace a package created concurrently.
            output.mkdir(mode=0o700)
            try:
                for name in ('full.ply', 'mobile.splat', 'desktop.splat', 'manifest.json'):
                    (temporary / name).rename(output / name)
            except BaseException:
                shutil.rmtree(output)
                raise
            temporary.rmdir()
            temporary = None
            return manifest
    finally:
        if temporary is not None:
            shutil.rmtree(temporary)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Validate and export private unscaled splat tiers')
    parser.add_argument('source')
    parser.add_argument('output')
    arguments = parser.parse_args()
    print(json.dumps(export_private_tiers(arguments.source, arguments.output), allow_nan=False))
