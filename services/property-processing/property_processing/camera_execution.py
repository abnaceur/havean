"""Decode only the API's canonical, bounded, privacy-prepared frame archive."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import tarfile
import time
from .errors import SourceError
from .colmap_cli import solve, validate_inputs
from .training_data import load_training_dataset

PROFILE = 'private-colmap-cpu-investigation-v1'
MAX_ARCHIVE_BYTES = 384*1024*1024


def unpack_frames(archive: Path, destination: Path):
    if archive.is_symlink() or not archive.is_file() or not 1024 <= archive.stat().st_size <= MAX_ARCHIVE_BYTES:
        raise SourceError('CAMERA_INPUT_INVALID')
    destination.mkdir(mode=0o700)
    (destination / 'frames').mkdir(mode=0o700)
    seen, total = set(), 0
    try:
        # Uncompressed ustar only: never extract paths, links, PAX or GNU metadata.
        with tarfile.open(archive, mode='r:') as source:
            for member in source:
                if not member.isfile() or member.type != tarfile.REGTYPE or member.offset_data-member.offset != 512 or member.pax_headers or member.linkname or member.name in seen or not (member.name == 'manifest.json' or re.fullmatch(r'frames/[a-f0-9-]{36}\.png', member.name)):
                    raise SourceError('CAMERA_INPUT_INVALID')
                seen.add(member.name)
                total += member.size
                if len(seen) > 601 or not 1 <= member.size <= (1048576 if member.name == 'manifest.json' else 16*1024*1024) or total > MAX_ARCHIVE_BYTES:
                    raise SourceError('CAMERA_INPUT_BUDGET_EXCEEDED')
                with source.extractfile(member) as content, (destination / member.name).open('xb') as output:
                    remaining = member.size
                    while remaining:
                        part = content.read(min(65536, remaining))
                        if not part:
                            raise SourceError('CAMERA_INPUT_INVALID')
                        output.write(part)
                        remaining -= len(part)
        if 'manifest.json' not in seen:
            raise SourceError('CAMERA_INPUT_INVALID')
        return validate_inputs(destination)[1]
    except (OSError, ValueError, tarfile.TarError):
        raise SourceError('CAMERA_INPUT_INVALID') from None


def pack_training(root: Path, destination: Path, max_bytes: int):
    verified = load_training_dataset(root)
    manifest = json.loads((root / 'manifest.json').read_text())
    names = ['manifest.json', 'sparse/cameras.txt', 'sparse/images.txt', 'sparse/points3D.txt']
    names += ['images/' + frame['name'] for frame in manifest['frames']]
    if sum((root / name).stat().st_size for name in names) > 380*1024*1024:
        raise SourceError('CAMERA_RESULT_BUDGET_EXCEEDED')
    expanded = sum(512+((root / name).stat().st_size+511)//512*512 for name in names)+1024
    if (expanded+10239)//10240*10240 > max_bytes:
        raise SourceError('SOURCE_SCRATCH_BUDGET_EXCEEDED')
    with tarfile.open(destination, 'w', format=tarfile.USTAR_FORMAT) as archive:
        for name in names:
            path = root / name
            if path.is_symlink() or not path.is_file():
                raise SourceError('CAMERA_RESULT_INVALID')
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = path.stat().st_size, 0o600, 0
            with path.open('rb') as content:
                archive.addfile(info, content)
    with destination.open('rb') as content:
        checksum = hashlib.file_digest(content, 'sha256').hexdigest()
    filename = 'camera-training-' + checksum + '.tar'
    size = destination.stat().st_size
    destination.rename(destination.with_name(filename))
    return {'sha256': checksum, 'byteSize': str(size), 'mime': 'application/x-tar', 'datasetFingerprint': verified['fingerprint']}


def execute_camera(directory: Path, name: str, *, timeout: int, max_scratch_bytes: int, cancelled=None):
    deadline = time.monotonic()+timeout
    root = directory.resolve(strict=True)
    if Path(name).name != name or not 1 <= timeout <= 1200 or not 96*1024*1024 <= max_scratch_bytes <= 2048*1024*1024:
        raise SourceError('CAMERA_PROFILE_INVALID')
    inputs, output = root / 'camera-input', root / 'camera-output'
    try:
        manifest = unpack_frames(root / name, inputs)
        # Account for both uploaded and unpacked inputs before native scratch.
        reserved = (root / name).stat().st_size + sum(path.stat().st_size for path in inputs.rglob('*') if path.is_file())
        remaining = int(deadline-time.monotonic())
        if remaining < 1:
            raise TimeoutError('Camera preparation exceeded deadline')
        report = solve(inputs, output, remaining, prepare_training=True, cancelled=cancelled,
                       max_scratch_bytes=max_scratch_bytes-reserved)
        if len(json.dumps(report).encode()) > 1048576:
            raise SourceError('CAMERA_RESULT_BUDGET_EXCEEDED')
        scratch = sum(path.stat().st_size for path in root.rglob('*') if path.is_file() and not path.is_symlink())
        training = pack_training(output / 'training-input', root / 'camera-training.partial', max_scratch_bytes-scratch) if report.get('trainingInput') else None
        if time.monotonic() > deadline:
            raise TimeoutError('Camera export exceeded deadline')
        if cancelled is not None and cancelled():
            raise InterruptedError('Camera solve cancelled')
        return {'processingProfile': PROFILE, 'inputManifestSha256': hashlib.sha256((inputs / 'manifest.json').read_bytes()).hexdigest(),
                'recipeId': manifest.get('recipeId'), 'recipeFingerprint': manifest.get('recipeFingerprint'),
                'datasetId': manifest.get('datasetId'), 'inputRevision': manifest.get('inputRevision'),
                'report': report, 'trainingArchive': training, 'publiclyServed': False, 'privacyReviewRequired': True}
    except InterruptedError:
        raise SourceError('SOURCE_CANCELLED') from None
    except TimeoutError:
        raise SourceError('CAMERA_DEADLINE_EXCEEDED') from None
    except (ValueError, RuntimeError, OSError):
        raise SourceError('CAMERA_SOLVE_FAILED') from None
    finally:
        # Retain only the checksum-bound training archive and review receipt.
        (root / 'camera-training.partial').unlink(missing_ok=True)
        for path in (inputs, output):
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
