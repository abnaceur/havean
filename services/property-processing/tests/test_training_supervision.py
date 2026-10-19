import json
import sys
import time

import pytest

from property_processing.gsplat_training import bounded_profile
from property_processing.training_supervision import launch, supervise


def test_real_process_finishes_and_stubborn_child_is_terminated_at_wall_clock_cap():
    assert supervise([sys.executable, '-c', 'pass'], seconds=2) == {'reason': None, 'exitCode': 0}
    start = time.monotonic()
    result = supervise([sys.executable, '-c', 'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(60)'], seconds=.3, grace_seconds=.1)
    assert result['reason'] == 'time_cap_reached' and result['exitCode'] < 0
    assert time.monotonic() - start < 3


def test_cancellation_terminates_real_child_without_waiting_for_deadline():
    result = supervise([sys.executable, '-c', 'import time; time.sleep(60)'], seconds=60, cancelled=lambda: True, grace_seconds=.1)
    assert result['reason'] == 'cancelled' and result['exitCode'] < 0


def test_resume_cannot_reset_budget_or_enable_a_production_profile(tmp_path):
    profile = bounded_profile(max_seconds=1)
    (tmp_path / 'checkpoint.json').write_text(json.dumps({'profile': profile, 'elapsedSeconds': 1}))
    assert launch(tmp_path, tmp_path, profile, resume=True, investigation=True) == {'reason': 'time_cap_reached', 'exitCode': None}
    with pytest.raises(ValueError, match='NOT_ADMITTED'):
        launch(tmp_path, tmp_path, profile)
    (tmp_path / 'checkpoint.json').write_text(json.dumps({'profile': profile, 'elapsedSeconds': -1}))
    with pytest.raises(ValueError):
        launch(tmp_path, tmp_path, profile, resume=True, investigation=True)
