"""Durable wall-clock reservations shared by all attempts of one training job."""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import time


def _write(path, value):
    fd = os.open(path.with_suffix('.writing'), os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    with os.fdopen(fd, 'w') as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise ValueError('Regular training budget file required')
        json.dump(value, handle, allow_nan=False)
        handle.flush()
        os.fsync(handle.fileno())
    path.with_suffix('.writing').replace(path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


@contextmanager
def execution_budget(output, profile, fingerprint, *, resume, checkpoint_elapsed=0):
    """Reserve before launching; a killed supervisor cannot refund unused time.

    Graceful stops charge actual wall time, including work since the last model
    checkpoint. Legacy checkpoints retain their recorded elapsed time.
    """
    output = Path(output)
    if output.is_symlink() or output.parent.is_symlink():
        raise ValueError('Regular private training directory required')
    if not resume:
        output.mkdir(mode=0o700)
    elif not output.is_dir():
        raise ValueError('Existing private training directory required')
    fd = os.open(output / '.training.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('Regular training lock required')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError('Training attempt already active') from error
        identity = hashlib.sha256(json.dumps(profile, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        path = output / 'training-budget.json'
        charged = checkpoint_elapsed
        if path.exists() or path.is_symlink():
            budget_fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(budget_fd, 'r') as handle:
                info = os.fstat(handle.fileno())
                if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= 4096:
                    raise ValueError('Bounded training budget required')
                prior = json.load(handle)
            if (prior.get('schemaVersion') != 1 or prior.get('profileSha256') != identity
                    or prior.get('datasetFingerprint') != fingerprint
                    or type(prior.get('chargedSeconds')) not in (int, float)
                    or not math.isfinite(prior['chargedSeconds'])
                    or not 0 <= prior['chargedSeconds'] <= profile['maxSeconds']):
                raise ValueError('Original training budget and dataset required')
            charged = max(charged, prior['chargedSeconds'])
        if type(charged) not in (int, float) or not math.isfinite(charged) or charged < 0:
            raise ValueError('Finite cumulative training budget required')
        total = profile['maxSeconds']
        remaining = max(0, total - charged)
        record = {'schemaVersion': 1, 'profileSha256': identity, 'datasetFingerprint': fingerprint,
                  'chargedSeconds': total, 'reserved': True}
        if not remaining:
            yield 0
            return
        _write(path, record)
        started = time.monotonic()
        try:
            yield remaining
        finally:
            # This update runs only after supervision has confirmed child exit.
            # SIGKILL leaves the full reservation charged, never a reset budget.
            record.update(chargedSeconds=min(total, charged + time.monotonic() - started), reserved=False)
            _write(path, record)
    finally:
        os.close(fd)
