"""Actual kernel-policy checks for authored files in the offline camera image."""
import json
import os
from pathlib import Path
import socket
import tempfile
import threading
from property_processing.decoder_isolation import enter_decoder_sandbox

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    job, inputs, foreign = root/'output', root/'input', root/'foreign'
    for path in (job, inputs, foreign):
        path.mkdir()
    (inputs/'frame').write_text('authored input sentinel')
    (foreign/'key').write_text('authored foreign sentinel')
    pid = os.fork()
    if pid == 0:
        try:
            policy = enter_decoder_sandbox(job, camera_inputs=inputs)
            assert (inputs/'frame').read_text() == 'authored input sentinel'
            (job/'result').write_text('private output')
            denied = []
            for action in [lambda: (foreign/'key').read_bytes(), lambda: (inputs/'frame').write_text('overwrite'),
                           lambda: socket.socket(), lambda: os.symlink(foreign/'key', job/'escape'),
                           lambda: Path('/proc/self/environ').read_bytes()]:
                try:
                    action()
                except PermissionError:
                    denied.append(True)
                else:
                    denied.append(False)
            assert len(denied) == 5 and all(denied)
            try:
                child = os.fork()
            except PermissionError:
                pass
            else:
                if child == 0:
                    os._exit(1)
                os.waitpid(child, 0)
                raise AssertionError('Process creation allowed')
            observed = []
            thread = threading.Thread(target=lambda: observed.append((inputs/'frame').read_text()))
            thread.start(); thread.join()
            assert observed == ['authored input sentinel']
            print(json.dumps({'scope':'authored kernel-policy fixture', 'policy':policy,
                              'sourceReadAndOutputWrite':True,'foreignReadAndInputWriteDenied':True,
                              'networkAndForkDenied':True,'threadInheritedScope':True}), flush=True)
            os._exit(0)
        except BaseException:
            os._exit(1)
    _, status = os.waitpid(pid, 0)
    assert os.waitstatus_to_exitcode(status) == 0
    assert (inputs/'frame').read_text() == 'authored input sentinel'
    assert (foreign/'key').read_text() == 'authored foreign sentinel'
