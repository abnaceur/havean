"""CPU-only transport and confinement checks; authored bytes, no CUDA import."""
import hashlib
import json
import os
from pathlib import Path
import socket
import threading
import pytest
from property_processing.errors import SourceError
from property_processing.training_execution import collect_training_outputs, execute_training, read_bounded
from property_processing.decoder_isolation import enter_decoder_sandbox


def test_private_output_collection_and_disabled_execution(tmp_path, monkeypatch):
    monkeypatch.delenv('PROCESSING_ENABLE_GSPLAT_INVESTIGATION', raising=False)
    with pytest.raises(SourceError, match='GPU_PROFILE_NOT_ADMITTED'):
        execute_training(tmp_path, 'missing.tar', 'a'*64, timeout=240, max_scratch_bytes=1073741824)
    (tmp_path/'viewer-tiers').mkdir()
    for name in ('scene.ply', 'viewer-tiers/mobile.splat', 'viewer-tiers/desktop.splat', 'held-out-003.png'):
        (tmp_path/name).write_bytes(b'authored transport bytes; not a reconstructed scene')
    report = dict(state='awaiting_review', iterations=500, datasetFingerprint='b'*64, publiclyServed=False,
                  scale=None, roomCoverage=None, splatCount=16, fallbacks=0, elapsedSeconds=1,
                  export={'tiers': [{'id': tier, 'splatCount': 16} for tier in ('mobile', 'desktop')]},
                  split={'heldOut': [3]}, heldOutMetrics=[{'width': 16, 'height': 16}])
    result = collect_training_outputs(tmp_path, report, 'a'*64, 'b'*64)
    assert len(result['outputs']) == 4 and result['publiclyServed'] is False
    assert result['outputs'][0]['sha256'] == hashlib.sha256((tmp_path/'scene.ply').read_bytes()).hexdigest()
    with pytest.raises(SourceError, match='TRAINING_NOT_COMPLETED'):
        collect_training_outputs(tmp_path, report, 'a'*64, 'c'*64)
    link = tmp_path/'link'
    link.symlink_to(tmp_path/'scene.ply')
    with pytest.raises(OSError):
        read_bounded(link, 1024)


def test_training_kernel_scope_without_gpu(tmp_path):
    output, source, foreign = [tmp_path/name for name in ('output', 'source', 'foreign')]
    for path in (output, source, foreign):
        path.mkdir()
    (source/'input').write_text('authored calibrated input sentinel')
    (foreign/'key').write_text('authored foreign sentinel')
    child = os.fork()
    if child == 0:
        try:
            policy = enter_decoder_sandbox(output, training_inputs=source)
            assert (source/'input').read_text() == 'authored calibrated input sentinel'
            (output/'result').write_text('private output')
            (output/'staging').mkdir(); (output/'tiers').mkdir()
            (output/'staging'/'scene').write_text('private scene')
            (output/'staging'/'scene').rename(output/'tiers'/'scene')
            assert (output/'tiers'/'scene').read_text() == 'private scene'
            for action in (lambda: (foreign/'key').read_bytes(), lambda: (source/'input').write_text('overwrite'), lambda: socket.socket(), lambda: os.fork()):
                try:
                    value = action()
                    if isinstance(value, int) and value == 0:
                        os._exit(1)
                except PermissionError:
                    continue
                raise AssertionError('Forbidden operation succeeded')
            seen = []
            thread = threading.Thread(target=lambda: seen.append((source/'input').read_text()))
            thread.start(); thread.join()
            assert len(seen) == 1
            # CUDA's local listener is permitted, but it cannot connect or carry data.
            with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET | socket.SOCK_CLOEXEC) as listener:
                listener.bind('\0haven-cuda-scope-' + str(os.getpid()))
                listener.listen(1)
                for action in (lambda: listener.connect('\0foreign'), lambda: listener.send(b'forbidden'), lambda: listener.accept()):
                    try:
                        action()
                    except PermissionError:
                        continue
                    raise AssertionError('Forbidden IPC operation succeeded')
            print(json.dumps({'policy': policy, 'gpuExecuted': False, 'scope': 'authored CPU kernel-policy check'}), flush=True)
            os._exit(0)
        except BaseException:
            os._exit(1)
    assert os.waitstatus_to_exitcode(os.waitpid(child, 0)[1]) == 0
