"""Durable runner adapter for the bounded, private gsplat investigation profile.

No simulator/CPU substitute. CUDA remains required by the real training worker.
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import time
from .gsplat_training import PROFILE_ID, bounded_profile, EXECUTION_ITERATIONS, QUALITY_PROFILE_ID
from .errors import SourceError
from .source_sandbox import supervise_source
from .training_archive import training_input
from .training_budget import execution_budget
from .training_data import load_training_dataset


def read_bounded(path, maximum):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= maximum:
            raise SourceError('TRAINING_OUTPUT_INVALID')
        body = handle.read(info.st_size + 1)
    if len(body) != info.st_size:
        raise SourceError('TRAINING_OUTPUT_INVALID')
    return body


def output_path(root, output):
    # Metadata selects an allowlisted canonical filename, never a client path.
    if output.get('kind') == 'splat_scene':
        return root / 'scene.ply'
    if output.get('kind') == 'splat_training_tier' and output.get('tier') in ('mobile', 'desktop'):
        folder = root / 'viewer-tiers'
        if folder.is_symlink() or not folder.is_dir():
            raise SourceError('TRAINING_OUTPUT_INVALID')
        return folder / (output['tier'] + '.splat')
    if output.get('kind') == 'held_out_render' and type(output.get('index')) is int and 0 <= output['index'] < 600:
        return root / f"held-out-{output['index']:03d}.png"
    raise SourceError('TRAINING_OUTPUT_INVALID')


def collect_training_outputs(root, report, archive_sha256, fingerprint, profile_id=PROFILE_ID):
    if (report.get('state') != 'awaiting_review' or report.get('iterations') not in ((6000,) if profile_id == QUALITY_PROFILE_ID else (500, EXECUTION_ITERATIONS))
            or report.get('datasetFingerprint') != fingerprint or report.get('publiclyServed') is not False
            or report.get('scale') is not None or report.get('roomCoverage') is not None):
        raise SourceError('TRAINING_NOT_COMPLETED')
    exported = report['export']
    outputs = [{'kind': 'splat_scene', 'mime': 'application/x-ply', 'splatCount': report['splatCount']}]
    if [tier['id'] for tier in exported['tiers']] != ['mobile', 'desktop']:
        raise SourceError('TRAINING_OUTPUT_INVALID')
    outputs.extend({'kind': 'splat_training_tier', 'mime': 'application/octet-stream', 'tier': tier['id'],
                    'splatCount': tier['splatCount'], 'encoding': 'splat32-wxyz-v1'} for tier in exported['tiers'])
    held = report['split']['heldOut']
    if not 1 <= len(held) <= 120 or len(held) != len(report['heldOutMetrics']) or len(set(held)) != len(held):
        raise SourceError('TRAINING_OUTPUT_INVALID')
    outputs.extend({'kind': 'held_out_render', 'mime': 'image/png', 'index': index,
                    'width': metric['width'], 'height': metric['height']} for index, metric in zip(held, report['heldOutMetrics']))
    total = 0
    for output in outputs:
        body = read_bounded(output_path(root, output), 32*1024*1024)
        total += len(body)
        output.update(sha256=hashlib.sha256(body).hexdigest(), byteSize=str(len(body)))
    if total > 63*1024*1024:
        raise SourceError('TRAINING_OUTPUT_BUDGET_EXCEEDED')
    return {'processingProfile': profile_id, 'inputArchiveSha256': archive_sha256, 'datasetFingerprint': fingerprint,
            'state': 'awaiting_review', 'iterations': report['iterations'], 'fallbacks': report['fallbacks'],
            'elapsedSeconds': report['elapsedSeconds'], 'splatCount': report['splatCount'],
            'heldOutMetrics': report['heldOutMetrics'], 'outputs': outputs, 'scale': None, 'roomCoverage': None,
            'humanRenderReviewRequired': True, 'publiclyServed': False}


def execute_training(directory, name, archive_sha256, *, timeout, max_scratch_bytes, cancelled=None, profile_id=QUALITY_PROFILE_ID):
    if os.environ.get('PROCESSING_ENABLE_GSPLAT_INVESTIGATION') != 'true' or os.environ.get('PROCESSING_DEPLOYMENT') not in ('test', 'development'):
        raise SourceError('GPU_PROFILE_NOT_ADMITTED')
    if Path(name).name != name or not 0 < timeout <= 1200 or not 512*1024*1024 <= max_scratch_bytes <= 2048*1024*1024:
        raise SourceError('TRAINING_PROFILE_INVALID')
    started = time.monotonic()
    profile = bounded_profile(iterations=6000,max_seconds=1200,splat_cap=75000,max_edge=1024,checkpoint_interval=100,adaptive=True) if profile_id==QUALITY_PROFILE_ID else bounded_profile(iterations=EXECUTION_ITERATIONS,max_seconds=240)
    root = Path(directory) / 'training'
    with training_input(Path(directory) / name, archive_sha256=archive_sha256) as prepared:
        fingerprint = load_training_dataset(prepared)['fingerprint']
        with execution_budget(root, profile, fingerprint, resume=False) as remaining:
            seconds = min(remaining, timeout - (time.monotonic() - started))
            if seconds <= 0:
                raise SourceError('TRAINING_TIME_BUDGET_EXCEEDED')
            environment = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'PYTHONPATH': str(Path(__file__).resolve().parent.parent),
                           'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUNBUFFERED': '1', 'HOME': str(root), 'TMPDIR': str(root),
                           'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2', 'CUDA_CACHE_DISABLE': '1'}
            command = [sys.executable, '-m', 'property_processing.training_job', '--input', str(prepared), '--output', str(root), '--profile', profile_id]
            report = supervise_source(command, environment, timeout=seconds, output_limit=2*1024*1024, cancelled=cancelled)
    # The supervisor has joined the only child before any output is admissible.
    return collect_training_outputs(root, report, archive_sha256, fingerprint, profile_id)
