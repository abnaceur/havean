"""Strict private undistorted COLMAP inputs and separated evaluation views."""
import hashlib
from decimal import Decimal
import json
import math
from pathlib import Path
import re
import struct

from .reconstruction_quality import summarize_model, _records


class UnusableCalibrationError(ValueError):
    """Recovered camera parameters cannot be used for bounded scene training."""


def separated_views(frames):
    """Hold out temporal blocks per declared capture/calibration group.

    Neighbouring views are excluded from training; this does not certify that
    different views are geometrically independent. Human render review remains.
    """
    if not 10 <= len(frames) <= 600:
        raise ValueError('At least ten calibrated views required for evaluation')
    groups, photographs = {}, []
    for index, frame in enumerate(frames):
        group = frame.get('cameraGroupId')
        timestamp = frame.get('timestampSeconds')
        if not isinstance(group, str) or not 1 <= len(group) <= 100 or not isinstance(timestamp, str) or len(timestamp) > 40 or not re.fullmatch(r'\d+(?:\.\d{1,9})?', timestamp):
            raise ValueError('Explicit capture group and timestamp required')
        kind = frame.get('captureKind', 'video')
        if kind == 'photo':
            checksum = frame.get('sha256', '')
            if not isinstance(checksum, str) or not re.fullmatch(r'[a-f0-9]{64}', checksum):
                raise ValueError('Checksummed still photograph required')
            photographs.append((checksum, index))
        elif kind == 'video':
            groups.setdefault(group, []).append((Decimal(timestamp), index))
        else:
            raise ValueError('Known capture kind required')
    training, evaluation, excluded = [], [], []
    for sequence in groups.values():
        sequence.sort()
        if any(a[0] >= b[0] for a, b in zip(sequence, sequence[1:])):
            raise ValueError('Distinct ordered capture timestamps required')
        holdouts = set(range(4, len(sequence), 8)) if len(sequence) >= 5 else set()
        for position, (_, index) in enumerate(sequence):
            if position in holdouts:
                evaluation.append(index)
            elif any(abs(position - other) <= 1 for other in holdouts):
                excluded.append(index)
            else:
                training.append(index)
    # Still images have no trustworthy temporal neighbours. Hold out distinct
    # content-hash-ordered images without making a temporal/coverage claim.
    if len({checksum for checksum, _ in photographs}) != len(photographs):
        raise ValueError('Distinct still photographs required for held-out evaluation')
    for position, (_, index) in enumerate(sorted(photographs)):
        (evaluation if position % 8 == 4 else training).append(index)
    if len(training) < 6 or not evaluation:
        raise ValueError('Separated held-out views and six training views required')
    return {'training': sorted(training), 'heldOut': sorted(evaluation), 'excludedNeighbours': sorted(excluded),
            'method': 'mixed_video_blocks_still_photo_hash_holdout_v1' if photographs else 'capture_timestamp_blocks_neighbour_gap_1', 'geometricIndependenceConfirmed': False}


def quaternion_matrix(quaternion):
    w, x, y, z = quaternion
    return [[1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
            [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
            [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)]]


def load_training_dataset(directory):
    root = Path(directory).resolve(strict=True)
    manifest_path = root / 'manifest.json'
    if manifest_path.is_symlink() or not manifest_path.is_file() or manifest_path.stat().st_size > 1048576:
        raise ValueError('Bounded private training manifest required')
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    frames = manifest.get('frames')
    if manifest.get('schemaVersion') != 1 or manifest.get('publiclyServed') is not False or manifest.get('privacyReviewRequired') is not True or not isinstance(frames, list):
        raise ValueError('Private pending-review dataset required')
    split = separated_views(frames)
    model = root / 'sparse'
    if model.is_symlink() or not model.is_dir():
        raise ValueError('Regular private calibrated model required')
    names = [frame.get('name') for frame in frames]
    if any(not isinstance(name, str) or not re.fullmatch(r'[a-f0-9-]{36}\.png', name) for name in names) or len(set(names)) != len(names):
        raise ValueError('Distinct canonical prepared PNG names required')
    summary = summarize_model(model, names)
    if not summary['advisoryQualityPassed'] or summary['registeredCameraCount'] != len(frames):
        raise ValueError('One connected model with all supplied calibrated views required')
    digest = hashlib.sha256(manifest_bytes)
    for name in ('cameras.txt', 'images.txt', 'points3D.txt'):
        digest.update(name.encode() + b'\0' + hashlib.sha256((model / name).read_bytes()).digest())
    poses = {pose['name']: pose for pose in summary['cameraPoses'].values()}
    views, total = [], 0
    for frame in frames:
        path = root / 'images' / frame['name']
        if path.is_symlink() or path.parent.is_symlink() or not path.is_file():
            raise ValueError('Regular prepared private image required')
        size = path.stat().st_size
        total += size
        if not 33 <= size <= 16 * 1024**2 or total > 320 * 1024**2:
            raise ValueError('Training image byte budget exceeded')
        body = path.read_bytes()
        if body[:8] != b'\x89PNG\r\n\x1a\n' or body[12:16] != b'IHDR' or hashlib.sha256(body).hexdigest() != frame.get('sha256'):
            raise ValueError('Prepared training PNG hash required')
        width, height = struct.unpack('>II', body[16:24])
        if not 1 <= width <= 2048 or not 1 <= height <= 2048 or width * height > 4 * 1024**2 or (width, height) != (frame.get('width'), frame.get('height')):
            raise ValueError('Actual bounded training image dimensions required')
        pose = poses[frame['name']]
        camera = summary['cameraCalibrationGroups'][pose['cameraId']]
        if (camera['width'], camera['height']) != (width, height):
            raise ValueError('Camera and actual image dimensions must match')
        parameters = camera['parameters']
        if camera['model'] == 'PINHOLE' and len(parameters) == 4:
            fx, fy, cx, cy = parameters
        elif camera['model'] == 'SIMPLE_PINHOLE' and len(parameters) == 3:
            fx, cx, cy = parameters
            fy = fx
        else:
            raise ValueError('Undistort calibrated images before pinhole training')
        if min(fx, fy) <= 0 or max(fx, fy) > 100000 or not 0 <= cx <= width or not 0 <= cy <= height:
            raise UnusableCalibrationError('Bounded positive calibrated pinhole intrinsics required for ' + frame['name'])
        rotation = quaternion_matrix(pose['worldToCameraQuaternion'])
        viewmat = [rotation[i] + [pose['worldToCameraTranslation'][i]] for i in range(3)] + [[0, 0, 0, 1]]
        views.append({'path': path, 'name': frame['name'], 'sha256': frame['sha256'], 'width': width, 'height': height, 'viewmat': viewmat, 'K': [[fx, 0, cx], [0, fy, cy], [0, 0, 1]]})
        digest.update(bytes.fromhex(frame['sha256']))
    points, colours = [], []
    for line in _records(model / 'points3D.txt'):
        if not line:
            continue
        words = line.split()
        position = [float(value) for value in words[1:4]]
        if any(not math.isfinite(value) or abs(value) > 1e6 for value in position):
            raise ValueError('Bounded finite sparse coordinates required')
        points.append(position)
        colours.append([int(value) / 255 for value in words[4:7]])
    if len(points) < 16:
        raise ValueError('At least sixteen connected sparse points required')
    return {'fingerprint': digest.hexdigest(), 'views': views, 'split': split, 'points': points, 'colours': colours,
            'summary': summary, 'scale': None, 'unit': 'arbitrary', 'publiclyServed': False}
