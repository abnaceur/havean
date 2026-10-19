"""Checks for the sealed minimal CPU runtime, without admitting production use."""
import hashlib
import json
from pathlib import Path
import re


def verify_runtime(root, expected, installed=False):
    root = Path(root)
    profile_path = root / 'runtime-profile.json'
    profile = json.loads(profile_path.read_text())
    if profile != expected or profile.get('id') != 'colmap-3.10-source-cpu-runtime-v1' or profile.get('productionEnabled') is not False or profile.get('gpuAvailable') is not False:
        raise ValueError('Sealed CPU runtime profile mismatch')
    names = set()
    for item in profile['files']:
        name = item['name']
        if not re.fullmatch(r'(?:bin/colmap|lib/[A-Za-z0-9_.+-]+|notices/[A-Za-z0-9_.+-]+)', name) or name in names:
            raise ValueError('Unique allowlisted runtime file required')
        names.add(name)
        path = Path('/usr/bin/colmap') if installed and name == 'bin/colmap' else root / name
        if path.is_symlink() or not path.is_file() or str(path.stat().st_size) != item['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Runtime file checksum mismatch')
    actual = {str(path.relative_to(root)) for path in root.rglob('*') if not path.is_dir()}
    allowed = (names - {'bin/colmap'} if installed else names) | {'runtime-profile.json'}
    if actual != allowed or any(path.is_symlink() for path in root.rglob('*')):
        raise ValueError('Unexpected runtime material')
    return profile
