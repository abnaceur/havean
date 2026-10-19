"""Consume only the bounded calibrated archive produced by camera processing."""
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import re
import stat
import tarfile
import tempfile

from .training_data import load_training_dataset

MAX_BYTES = 384 * 1024 * 1024
FIXED = {'manifest.json', 'sparse/cameras.txt', 'sparse/images.txt', 'sparse/points3D.txt'}


def unpack_training_archive(source, destination, checksum):
    if not isinstance(checksum, str) or not re.fullmatch(r'[a-f0-9]{64}', checksum):
        raise ValueError('Expected calibrated archive checksum required')
    destination = Path(destination)
    if destination.is_symlink() or not destination.is_dir() or any(destination.iterdir()):
        raise ValueError('Empty private training input directory required')
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as handle:
        original = os.fstat(handle.fileno())
        if not stat.S_ISREG(original.st_mode) or not 1024 <= original.st_size <= MAX_BYTES:
            raise ValueError('Bounded regular calibrated archive required')
        if hashlib.file_digest(handle, 'sha256').hexdigest() != checksum:
            raise ValueError('Calibrated archive checksum mismatch')
        handle.seek(0)
        seen, total = set(), 0
        (destination / 'images').mkdir(mode=0o700)
        (destination / 'sparse').mkdir(mode=0o700)
        # No tar extraction API: paths, links and extended metadata never choose
        # filesystem destinations. Read a bounded payload from the same handle.
        with tarfile.open(fileobj=handle, mode='r:') as archive:
            for member in archive:
                if (member.name not in FIXED and not re.fullmatch(r'images/[a-f0-9-]{36}\.png', member.name)
                        or member.name in seen or member.type != tarfile.REGTYPE
                        or member.offset_data - member.offset != 512 or member.pax_headers or member.linkname):
                    raise ValueError('Canonical calibrated archive members required')
                seen.add(member.name)
                total += member.size
                limit = 1048576 if member.name == 'manifest.json' else 16*1024*1024 if member.name.startswith('images/') else 64*1024*1024
                if len(seen) > 604 or not 1 <= member.size <= limit or total > MAX_BYTES:
                    raise ValueError('Calibrated input budget exceeded')
                with archive.extractfile(member) as content, (destination / member.name).open('xb') as output:
                    os.fchmod(output.fileno(), 0o600)
                    remaining = member.size
                    while remaining:
                        part = content.read(min(65536, remaining))
                        if not part:
                            raise ValueError('Truncated calibrated input')
                        output.write(part)
                        remaining -= len(part)
        if not FIXED <= seen:
            raise ValueError('Calibrated model and manifest required')
        dataset = load_training_dataset(destination)
        expected = FIXED | {'images/' + view['name'] for view in dataset['views']}
        if seen != expected:
            raise ValueError('Archive must contain exactly the calibrated views')
        current = os.fstat(handle.fileno())
        if (current.st_size, current.st_mtime_ns, current.st_ctime_ns) != (original.st_size, original.st_mtime_ns, original.st_ctime_ns):
            raise ValueError('Calibrated archive changed during preparation')
        return dataset


@contextmanager
def training_input(source, *, archive_sha256=None, dataset_fingerprint=None):
    """Keep prepared pixels alive for the supervised child, then remove them."""
    source = Path(source)
    if dataset_fingerprint is not None and not re.fullmatch(r'[a-f0-9]{64}', dataset_fingerprint):
        raise ValueError('Canonical dataset fingerprint required')
    if source.is_symlink():
        raise ValueError('Regular calibrated input required')
    if source.is_dir():
        if archive_sha256 is not None:
            raise ValueError('An archive checksum cannot identify a directory')
        dataset = load_training_dataset(source)
        if dataset_fingerprint is not None and dataset['fingerprint'] != dataset_fingerprint:
            raise ValueError('Calibrated dataset fingerprint mismatch')
        yield source
        return
    with tempfile.TemporaryDirectory(prefix='haven-calibrated-') as scratch:
        root = Path(scratch)
        dataset = unpack_training_archive(source, root, archive_sha256)
        if dataset_fingerprint is not None and dataset['fingerprint'] != dataset_fingerprint:
            raise ValueError('Calibrated dataset fingerprint mismatch')
        yield root
