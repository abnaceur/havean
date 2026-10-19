"""Wall-clock supervision independent of CUDA kernels or Python signal handling."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def supervise(command, *, seconds, cancelled=None, grace_seconds=5):
    if not isinstance(seconds, (int, float)) or isinstance(seconds, bool) or not 0 < seconds <= 3600 or not 0 < grace_seconds <= 5:
        raise ValueError('Bounded supervision deadline and grace required')
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, start_new_session=True)
    deadline = time.monotonic() + seconds
    reason = None
    try:
        while process.poll() is None:
            if cancelled is not None and cancelled():
                reason = 'cancelled'
                break
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                reason = 'time_cap_reached'
                break
            try:
                process.wait(timeout=min(.2, remaining))
            except subprocess.TimeoutExpired:
                pass
        if reason is not None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=grace_seconds)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        return {'reason': reason, 'exitCode': process.returncode}
    finally:
        # Includes parent exceptions and interruption: never leave an orphaned
        # training process or a native compiler descendant running.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        if process.poll() is None:
            process.wait(timeout=5)


def launch(directory, output, profile, *, resume=False, investigation=False, archive_sha256=None, dataset_fingerprint=None):
    if not investigation:
        raise ValueError('GPU_PROFILE_NOT_ADMITTED')
    seconds = profile['maxSeconds']
    if resume:
        pointer = Path(output) / 'checkpoint.json'
        if pointer.is_symlink() or not pointer.is_file() or pointer.stat().st_size > 16384:
            raise ValueError('Bounded private checkpoint pointer required')
        metadata = json.loads(pointer.read_text())
        elapsed = metadata.get('elapsedSeconds')
        if metadata.get('profile') != profile or type(elapsed) not in (float, int) or not 0 <= elapsed <= seconds + 30:
            raise ValueError('Resume must retain the original cumulative budget')
        seconds -= elapsed
        if seconds <= 0:
            return {'reason': 'time_cap_reached', 'exitCode': None}
    from .training_archive import training_input
    from .training_budget import execution_budget
    from .training_data import load_training_dataset
    with training_input(directory, archive_sha256=archive_sha256, dataset_fingerprint=dataset_fingerprint) as prepared:
        fingerprint = load_training_dataset(prepared)['fingerprint']
        with execution_budget(output, profile, fingerprint, resume=resume,
                              checkpoint_elapsed=profile['maxSeconds'] - seconds) as remaining:
            if remaining <= 0:
                return {'reason': 'time_cap_reached', 'exitCode': None}
            return _launch_prepared(prepared, output, profile, seconds=remaining, resume=resume)


def _launch_prepared(directory, output, profile, *, seconds, resume=False):
    command = [sys.executable, '-m', 'property_processing.gsplat_training', '--input', str(directory), '--output', str(output),
               '--iterations', str(profile['iterations']), '--max-seconds', str(profile['maxSeconds']), '--splat-cap', str(profile['splatCap']),
               '--max-edge', str(profile['maxEdge']), '--checkpoint-interval', str(profile['checkpointInterval']), '--investigation', '--worker']
    if resume:
        command.append('--resume')
    cancelled = False
    def stop(_number, _frame):
        nonlocal cancelled
        cancelled = True
    handlers = {number: signal.signal(number, stop) for number in (signal.SIGTERM, signal.SIGINT)}
    try:
        return supervise(command, seconds=seconds, cancelled=lambda: cancelled)
    finally:
        for number, handler in handlers.items():
            signal.signal(number, handler)
