import json
import os
import signal
import subprocess
import sys
import time

import pytest

from property_processing.gsplat_training import bounded_profile
from property_processing.training_budget import execution_budget


def test_resume_charges_wall_time_since_checkpoint_and_refuses_concurrent_attempt(tmp_path):
    output = tmp_path / 'job'
    profile = bounded_profile(max_seconds=10)
    with execution_budget(output, profile, 'a'*64, resume=False) as seconds:
        assert seconds == 10
        with pytest.raises(ValueError, match='already active'):
            with execution_budget(output, profile, 'a'*64, resume=True):
                pass
        time.sleep(.05)
    with execution_budget(output, profile, 'a'*64, resume=True, checkpoint_elapsed=0) as seconds:
        assert 0 < seconds < 9.99
    with pytest.raises(ValueError, match='Original training budget'):
        with execution_budget(output, profile, 'b'*64, resume=True):
            pass


def test_killed_supervisor_keeps_reservation_so_resume_cannot_reset_budget(tmp_path):
    output = tmp_path / 'job'
    command = """
import sys,time
from property_processing.training_budget import execution_budget
from property_processing.gsplat_training import bounded_profile
with execution_budget(sys.argv[1], bounded_profile(max_seconds=10), 'a'*64, resume=False):
    print('reserved', flush=True)
    time.sleep(60)
"""
    process = subprocess.Popen([sys.executable, '-c', command, str(output)], stdout=subprocess.PIPE)
    try:
        # A bounded wait observes the real fsynced reservation before SIGKILL.
        import select
        assert select.select([process.stdout], [], [], 5)[0]
        assert process.stdout.readline() == b'reserved\n'
        os.kill(process.pid, signal.SIGKILL)
        process.wait(timeout=5)
        record = json.loads((output / 'training-budget.json').read_text())
        assert record['reserved'] is True and record['chargedSeconds'] == 10
        with execution_budget(output, bounded_profile(max_seconds=10), 'a'*64, resume=True) as seconds:
            assert seconds == 0
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        process.stdout.close()
