"""Fail-closed admission of the packaged, offline CPU OCR release."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import stat
from functools import lru_cache


def _verified_file(path, expected, maximum):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= maximum:
            raise ValueError('OCR_RELEASE_FILE_INVALID')
        if hashlib.file_digest(handle, 'sha256').hexdigest() != expected:
            raise ValueError('OCR_RELEASE_CHECKSUM_MISMATCH')


@lru_cache(maxsize=1)
def production_ocr_ready():
    if os.environ.get('PROCESSING_ENABLE_OCR') != 'true':
        return False
    expected = os.environ.get('PROCESSING_OCR_RELEASE_SHA256', '')
    if not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise ValueError('OCR_RELEASE_PIN_REQUIRED')
    path = Path('/opt/processing/ocr-release.json')
    _verified_file(path, expected, 2*1024*1024)
    release = json.loads(path.read_text())
    if (release.get('schemaVersion') != 1 or release.get('id') != 'paddleocr-3.3.3-offline-cpu-v1'
            or release.get('enabled') is not True or release.get('runtimeDownloads') is not False
            or release.get('distributionReview', {}).get('status') != 'complete'):
        raise ValueError('OCR_RELEASE_NOT_ADMITTED')
    for name, version in release['packages'].items():
        if importlib.metadata.version(name) != version:
            raise ValueError('OCR_RELEASE_VERSION_MISMATCH')
    allowed = ('/usr/local/lib/python3.12/site-packages/', '/opt/ocr-models/', '/usr/lib/x86_64-linux-gnu/')
    for file in release['runtimeFiles']:
        name = file['path']
        if not name.startswith(allowed) or any(part in ('.', '..') for part in name.split('/')):
            raise ValueError('OCR_RELEASE_PATH_INVALID')
        _verified_file(name, file['sha256'], 1024**3)
    for name in release['excludedFiles']:
        candidate = Path('/usr/local/lib/python3.12/site-packages') / name
        if candidate.exists() or candidate.is_symlink():
            raise ValueError('OCR_RELEASE_EXCLUDED_FILE_PRESENT')
    return True
