"""Private one-fps frame sampling with decoded presentation-time provenance."""
import hashlib
import json
import math
from pathlib import Path
import re
import time
from .media_probe import _native, normalize_probe, verified_media_runtime
from .source_sandbox import inspect_source
from .sources import SourceError


def camera_metadata(info):
    tags = info.get('format', {}).get('tags', {})
    if not isinstance(tags, dict):
        tags = {}
    def text(*keys):
        values = {tags[key].strip() for key in keys if isinstance(tags.get(key), str) and bool(tags[key].strip()) and 0 < len(tags[key]) <= 128 and not re.search(r'[\x00-\x1f\x7f]', tags[key])}
        return next(iter(values)) if len(values) == 1 else None
    focal = text('focal_length', 'com.apple.quicktime.focal_length')
    if focal is not None and (not re.fullmatch(r'[0-9]{1,4}(?:\.[0-9]{1,6})?', focal) or not 0 < float(focal) <= 10000):
        focal = None
    return {'make': text('make', 'com.apple.quicktime.make'),
            'model': text('model', 'com.apple.quicktime.model'),
            'lensModel': text('lens_model', 'com.apple.quicktime.lens_model'),
            'focalLengthMm': focal, 'intrinsics': None, 'basis': 'container_tags_unverified'}


def extract_frames(directory: Path, name: str, *, timeout=15, cancelled=None):
    if not isinstance(timeout, (int, float)) or not 0 < timeout <= 60:
        raise SourceError('MEDIA_PROFILE_INVALID')
    deadline = time.monotonic()+timeout
    def remaining():
        value = deadline-time.monotonic()
        if value <= 0:
            raise SourceError('MEDIA_TIME_BUDGET_EXCEEDED')
        return value
    verified_media_runtime()
    root = directory.resolve(strict=True)
    source = root/name
    if Path(name).name != name or source.is_symlink() or not source.is_file() or source.resolve(strict=True).parent != root:
        raise SourceError('MEDIA_SOURCE_PATH_INVALID')
    if not 0 < source.stat().st_size <= 10*1024*1024:
        raise SourceError('MEDIA_SOURCE_BUDGET_EXCEEDED')
    if list(root.glob('frame-*.png')):
        raise SourceError('MEDIA_OUTPUT_EXISTS')
    try:
        info = json.loads(_native(root, name, 'probe', timeout=remaining(), cancelled=cancelled))
        metadata = normalize_probe(info)
    except (ValueError, TypeError, UnicodeError) as error:
        if isinstance(error, SourceError):
            raise
        raise SourceError('MEDIA_PROBE_INVALID') from None
    diagnostics = _native(root, name, 'frames', timeout=remaining(), cancelled=cancelled)
    bases = re.findall(rb'config in time_base:\s*([0-9]+)/([0-9]+)', diagnostics)
    if len(bases) != 1 or not all(0 < int(value) <= 1000000000 for value in bases[0]):
        raise SourceError('MEDIA_FRAME_TIMESTAMPS_INVALID')
    numerator, denominator = (int(value) for value in bases[0])
    matches = re.findall(rb'\[Parsed_showinfo_[^\]]+\]\s+n:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:([0-9.eE+\-]+)', diagnostics)
    files = sorted(root.glob('frame-*.png'))
    if not 1 <= len(matches) == len(files) <= 600 or any(file.name != f'frame-{index:03d}.png' or file.is_symlink() for index, file in enumerate(files, 1)):
        raise SourceError('MEDIA_FRAME_TIMESTAMPS_INVALID')
    if sum(file.stat().st_size for file in files) > 64*1024*1024:
        raise SourceError('MEDIA_FRAME_BYTE_BUDGET_EXCEEDED')
    frames, total, previous = [], 0, None
    for index, (file, (number, pts, timestamp)) in enumerate(zip(files, matches)):
        seconds = float(timestamp)
        if int(number) != index or not math.isfinite(seconds) or seconds < 0 or abs(seconds-int(pts)*numerator/denominator) > .001 or seconds > metadata['durationSeconds']+1 or previous is not None and seconds-previous < .999:
            raise SourceError('MEDIA_FRAME_TIMESTAMPS_INVALID')
        previous = seconds
        image = inspect_source(root, file.name, 'image', timeout=min(15,remaining()), cancelled=cancelled)['image']
        if max(image['width'], image['height']) > 1600 or abs(image['width']/image['height']-metadata['uprightWidth']/metadata['uprightHeight']) > .02:
            raise SourceError('MEDIA_UPRIGHT_OUTPUT_INVALID')
        body = (root/image['previewFilename']).read_bytes()
        total += len(body)
        if total > 64*1024*1024 or hashlib.sha256(body).hexdigest() != image['sha256']:
            raise SourceError('MEDIA_FRAME_BYTE_BUDGET_EXCEEDED')
        frames.append({'index': index+1, 'timestampSeconds': timestamp.decode('ascii'),
                       'presentationTimestamp': pts.decode('ascii'), 'timestampBasis': 'decoded_input_pts',
                       'timeBase': f'{numerator}/{denominator}',
                       'sha256': image['sha256'], 'byteSize': len(body), 'width': image['width'],
                       'height': image['height'], 'previewFilename': image['previewFilename']})
    return {**metadata, 'camera': camera_metadata(info), 'samplingProfile': 'decoded-select-one-fps-v1',
            'processingProfile': 'private-media-frames-v1', 'isolationProfile': 'linux-landlock-seccomp-media-v1', 'frames': frames}
