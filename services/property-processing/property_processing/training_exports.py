"""Discard interrupted derived exports without altering durable checkpoints."""
import json
from pathlib import Path
import re
import stat


def reset_interrupted_export(output):
    output = Path(output)
    report = output / 'training-report.json'
    if report.exists() or report.is_symlink():
        if report.is_symlink() or not report.is_file() or report.stat().st_size > 1048576:
            raise ValueError('Bounded regular training report required')
        if json.loads(report.read_text()).get('state') == 'awaiting_review':
            raise ValueError('Completed training output cannot be resumed')
    files, directories = [], []
    # A killed exporter may leave its private staging directory. Inspect only
    # known output names; never recurse into checkpoint or input directories.
    for entry in output.iterdir():
        if entry.name in ('scene.ply', 'training-report.json', 'training-report.writing') or re.fullmatch(r'held-out-\d{3}\.png', entry.name):
            files.append(entry)
        elif entry.name == 'viewer-tiers' or re.fullmatch(r'\.splat-export-[a-z0-9_]{8}', entry.name):
            if entry.is_symlink() or not entry.is_dir():
                raise ValueError('Regular private export directory required')
            children = list(entry.iterdir())
            if len(children) > 4 or any(child.name not in ('full.ply', 'mobile.splat', 'desktop.splat', 'manifest.json') for child in children):
                raise ValueError('Canonical interrupted export files required')
            files.extend(children)
            directories.append(entry)
    if len(files) > 620 or len(directories) > 2:
        raise ValueError('Bounded interrupted export required')
    if any(not stat.S_ISREG(file.lstat().st_mode) for file in files):
        raise ValueError('Regular interrupted export files required')
    for file in files:
        file.unlink()
    for directory in directories:
        directory.rmdir()
