"""Real COLMAP process-group termination on the licensed prepared fixture."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from uuid import uuid4

output = Path('/results') / ('runtime-cancel-' + str(uuid4()))
process = subprocess.Popen([sys.executable, '-m', 'property_processing.colmap_cli',
                            '--input', '/input', '--output', str(output), '--max-seconds', '240'],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    deadline = time.monotonic() + 15
    children = []
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Camera command finished before actual cancellation was observed')
        children = [int(pid) for pid in Path('/proc/%s/task/%s/children' % (process.pid, process.pid)).read_text().split()]
        if children and all(Path('/proc/%s/comm' % pid).read_text().strip() == 'colmap' and os.getpgid(pid) == pid for pid in children):
            break
        time.sleep(0.01)
    else:
        raise RuntimeError('Real separate COLMAP process group not observed')
    started = time.monotonic()
    process.send_signal(signal.SIGTERM)
    stdout, _stderr = process.communicate(timeout=5)
    if process.returncode != 130 or json.loads(stdout) != {'state': 'cancelled', 'publiclyServed': False}:
        raise RuntimeError('Camera cancellation receipt invalid')
    if any(Path('/proc/%s' % pid).exists() for pid in children) or (output / 'camera-solve-report.json').exists():
        raise RuntimeError('Native child or successful report survived cancellation')
    print(json.dumps({'label': 'P', 'actualColmapChildrenTerminated': len(children),
                      'cancellationMilliseconds': (time.monotonic() - started) * 1000,
                      'successfulCameraReportEmitted': False, 'productionEnabled': False, 'physicalGpu': False}))
finally:
    if process.poll() is None:
        process.kill()
        process.wait()
