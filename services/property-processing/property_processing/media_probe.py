"""Private bounded media metadata and upright thumbnail adapter; no public approval."""
import hashlib
import json
import math
import re
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import sys
import time
from .sources import SourceError

SUPPORTED_CODECS = frozenset(('h264', 'hevc', 'vp8', 'vp9'))


def verified_media_runtime():
    profile = json.loads(Path('/opt/media/runtime-profile.json').read_text())
    dependencies = json.loads((Path(__file__).resolve().parent.parent/'dependencies.json').read_text())
    native = dependencies.get('nativeTools', {}).get('ffmpeg-media', {})
    if native.get('enabled') is not True or profile.get('version') != native.get('version') or profile.get('sourceSha256') != native.get('sourceSha256') or profile.get('binaries') != native.get('binaryHashes'):
        raise SourceError('MEDIA_RUNTIME_UNAVAILABLE')
    for name, expected in native['binaryHashes'].items():
        if name not in ('ffmpeg', 'ffprobe') or hashlib.sha256(Path('/opt/media/bin/'+name).read_bytes()).hexdigest() != expected:
            raise SourceError('MEDIA_BINARY_MISMATCH')
    return profile


def _native(directory: Path, name: str, mode: str, *, timeout=15, cancelled=None):
    tool = 'ffprobe' if mode == 'probe' else 'ffmpeg'
    environment = {'PATH': '/usr/bin:/bin', 'PYTHONPATH': str(Path(__file__).resolve().parent.parent),
                   'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUNBUFFERED': '1'}
    child = subprocess.Popen([sys.executable, '-m', 'property_processing.media_exec', str(directory), tool, name, mode],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, env=environment)
    output, diagnostics, frame_diagnostics, deadline = bytearray(), 0, bytearray(), time.monotonic()+timeout
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ, True)
            selector.register(child.stderr, selectors.EVENT_READ, False)
            while selector.get_map():
                if cancelled and cancelled():
                    raise SourceError('MEDIA_CANCELLED')
                if time.monotonic() >= deadline:
                    raise SourceError('MEDIA_TIME_BUDGET_EXCEEDED')
                for key, _ in selector.select(min(.1, max(.001, deadline-time.monotonic()))):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                    elif key.data:
                        output.extend(chunk)
                        if len(output) > 1024*1024:
                            raise SourceError('MEDIA_OUTPUT_BUDGET_EXCEEDED')
                    else:
                        diagnostics += len(chunk)
                        if diagnostics > (1024*1024 if mode == 'frames' else 65536):
                            raise SourceError('MEDIA_DIAGNOSTIC_BUDGET_EXCEEDED')
                        if mode == 'frames':
                            frame_diagnostics.extend(chunk)
        try:
            child.wait(timeout=max(.001, deadline-time.monotonic()))
        except subprocess.TimeoutExpired:
            raise SourceError('MEDIA_TIME_BUDGET_EXCEEDED') from None
        if child.returncode:
            raise SourceError('MEDIA_DECODE_FAILED')
        if mode == 'frames':
            return bytes(frame_diagnostics)
        return bytes(output)
    finally:
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        child.wait()
        child.stdout.close()
        child.stderr.close()


def normalize_probe(info: dict):
    if not isinstance(info, dict) or not isinstance(info.get('streams'), list):
        raise SourceError('MEDIA_PROBE_INVALID')
    videos = [stream for stream in info['streams'] if stream.get('codec_type') == 'video' and not stream.get('disposition', {}).get('attached_pic')]
    if len(videos) != 1:
        raise SourceError('MEDIA_SINGLE_VIDEO_REQUIRED')
    stream = videos[0]
    if stream.get('codec_name') not in SUPPORTED_CODECS:
        raise SourceError('MEDIA_CODEC_UNSUPPORTED')
    if stream.get('sample_aspect_ratio') not in (None, 'N/A', '0:1', '1:1'):
        raise SourceError('MEDIA_PIXEL_ASPECT_UNSUPPORTED')
    width, height = stream.get('width'), stream.get('height')
    if type(width) is not int or type(height) is not int or not 64 <= width <= 4096 or not 64 <= height <= 4096:
        raise SourceError('MEDIA_DIMENSION_BUDGET_EXCEEDED')
    try:
        duration = float(info.get('format', {}).get('duration', stream.get('duration')))
    except (TypeError, ValueError):
        raise SourceError('MEDIA_DURATION_UNKNOWN') from None
    if not math.isfinite(duration) or not 0 < duration <= 600:
        raise SourceError('MEDIA_DURATION_BUDGET_EXCEEDED')
    format_names = set(str(info.get('format', {}).get('format_name', '')).split(','))
    if not format_names.intersection(('mov', 'mp4', 'matroska', 'webm')):
        raise SourceError('MEDIA_CONTAINER_UNSUPPORTED')
    rotations = []
    if 'rotate' in stream.get('tags', {}):
        try:
            rotations.append(float(stream['tags']['rotate']))
        except (TypeError, ValueError):
            raise SourceError('MEDIA_ORIENTATION_INVALID') from None
    for entry in stream.get('side_data_list', []):
        if not isinstance(entry, dict):
            raise SourceError('MEDIA_ORIENTATION_INVALID')
        if entry.get('side_data_type') == 'Display Matrix':
            if 'rotation' not in entry:
                raise SourceError('MEDIA_ORIENTATION_INVALID')
            try:
                rotations.append(float(entry['rotation']))
            except (TypeError, ValueError):
                raise SourceError('MEDIA_ORIENTATION_INVALID') from None
            rows = str(entry.get('displaymatrix', '')).strip().splitlines()
            matrix = []
            for row in rows:
                match = re.fullmatch(r'\s*[0-9a-fA-F]{8}:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*', row)
                if not match:
                    raise SourceError('MEDIA_DISPLAY_TRANSFORM_UNSUPPORTED')
                matrix.extend(int(value) for value in match.groups())
            if len(matrix) != 9 or any(matrix[index] != 0 for index in (2, 5, 6, 7)) or matrix[8] != 1073741824 or any(abs(matrix[index]) not in (0, 65536) for index in (0, 1, 3, 4)) or matrix[0]*matrix[4]-matrix[1]*matrix[3] != 65536**2:
                raise SourceError('MEDIA_DISPLAY_TRANSFORM_UNSUPPORTED')
    if any(not math.isfinite(value) or value % 90 != 0 for value in rotations) or len({value % 360 for value in rotations}) > 1:
        raise SourceError('MEDIA_ORIENTATION_CONFLICT')
    rotation = int(rotations[0] % 360) if rotations else 0
    return {'codec': stream['codec_name'], 'durationSeconds': duration, 'encodedWidth': width, 'encodedHeight': height,
            'displayRotationDegrees': rotation, 'orientationBasis': 'container_display_matrix' if rotations else 'no_rotation_metadata',
            'uprightWidth': height if rotation in (90, 270) else width,
            'uprightHeight': width if rotation in (90, 270) else height,
            'locationMetadataRetained': False, 'reviewRequired': True}


def probe_media(directory: Path, name: str, *, timeout=15, cancelled=None):
    if not isinstance(timeout, (int, float)) or not 0 < timeout <= 15:
        raise SourceError('MEDIA_PROFILE_INVALID')
    deadline = time.monotonic()+timeout

    def remaining():
        duration = deadline-time.monotonic()
        if duration <= 0:
            raise SourceError('MEDIA_TIME_BUDGET_EXCEEDED')
        return duration

    verified_media_runtime()
    root = directory.resolve(strict=True)
    source = root / name
    if Path(name).name != name or source.is_symlink() or source.resolve(strict=True).parent != root or not source.is_file():
        raise SourceError('MEDIA_SOURCE_PATH_INVALID')
    if not 0 < source.stat().st_size <= 2*1024*1024*1024:
        raise SourceError('MEDIA_SOURCE_BUDGET_EXCEEDED')
    try:
        metadata = normalize_probe(json.loads(_native(root, name, 'probe', timeout=remaining(), cancelled=cancelled)))
    except (json.JSONDecodeError, UnicodeError, TypeError, ValueError) as error:
        if isinstance(error, SourceError):
            raise
        raise SourceError('MEDIA_PROBE_INVALID') from None
    thumbnail = root/'thumbnail.png'
    if thumbnail.exists() or thumbnail.is_symlink():
        raise SourceError('MEDIA_OUTPUT_EXISTS')
    _native(root, name, 'thumbnail', timeout=remaining(), cancelled=cancelled)
    # Canonical image decode/metadata stripping remains in the existing separate
    # confined Pillow child. The runner never invokes a native image decoder itself.
    from .source_sandbox import inspect_source
    normalized = inspect_source(root, 'thumbnail.png', 'image', timeout=remaining(), cancelled=cancelled)['image']
    width, height = normalized['width'], normalized['height']
    if normalized['detectedMime'] != 'image/png' or max(width, height) > 640 or abs(width/height-metadata['uprightWidth']/metadata['uprightHeight']) > .02:
        raise SourceError('MEDIA_UPRIGHT_OUTPUT_INVALID')
    filename = normalized['previewFilename']
    if Path(filename).name != filename:
        raise SourceError('MEDIA_OUTPUT_INVALID')
    descriptor = os.open(root/filename, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise SourceError('MEDIA_OUTPUT_INVALID')
        body = handle.read(16*1024*1024+1)
    if len(body) > 16*1024*1024 or hashlib.sha256(body).hexdigest() != normalized['sha256']:
        raise SourceError('MEDIA_OUTPUT_BUDGET_EXCEEDED')
    return {**metadata, 'processingProfile': 'ffmpeg715-minimal-media-v1', 'isolationProfile': 'linux-landlock-seccomp-media-v1',
            'thumbnail': {'filename': filename, 'sha256': hashlib.sha256(body).hexdigest(), 'byteSize': str(len(body)),
                          'width': width, 'height': height, 'mime': 'image/png'}}
