import json

import pytest

from property_processing.training_exports import reset_interrupted_export


def test_partial_export_can_restart_without_touching_checkpoint_or_completed_result(tmp_path):
    checkpoint = tmp_path / 'checkpoint-000050.pt'
    checkpoint.write_bytes(b'authored checkpoint sentinel; not a CUDA checkpoint')
    (tmp_path / 'scene.ply').write_bytes(b'interrupted')
    (tmp_path / 'held-out-004.png').write_bytes(b'interrupted')
    staging = tmp_path / '.splat-export-abcd1234'
    staging.mkdir()
    (staging / 'desktop.splat').write_bytes(b'interrupted')
    reset_interrupted_export(tmp_path)
    assert list(tmp_path.iterdir()) == [checkpoint]
    assert checkpoint.read_bytes() == b'authored checkpoint sentinel; not a CUDA checkpoint'
    (tmp_path / 'scene.ply').write_bytes(b'completed sentinel')
    (tmp_path / 'training-report.json').write_text(json.dumps({'state': 'awaiting_review'}))
    with pytest.raises(ValueError, match='Completed training output'):
        reset_interrupted_export(tmp_path)
    assert (tmp_path / 'scene.ply').read_bytes() == b'completed sentinel'
