import json
import os
import subprocess
import sys
from property_processing.decoder_isolation import landlock_abi


def test_actual_unprivileged_kernel_policy_denies_other_job_secret_network_and_process(tmp_path):
    job = tmp_path / 'job'
    job.mkdir()
    (job / 'input').write_text('allowed fixture')
    secret = tmp_path / 'runner-key'
    secret.write_text('PRIVATE_OTHER_JOB_SENTINEL')
    code = '''
import json,os,socket,subprocess,sys
from pathlib import Path
from property_processing.decoder_isolation import enter_decoder_sandbox
root,secret=Path(sys.argv[1]),Path(sys.argv[2])
profile=enter_decoder_sandbox(root)
assert (root/'input').read_text()=='allowed fixture'
(root/'preview').write_text('private derivative')
checks=[]
for action in [lambda: secret.read_text(),lambda: Path('/proc/self/environ').read_bytes(),lambda: socket.socket(),lambda: socket.socket(socket.AF_INET,socket.SOCK_DGRAM),lambda: subprocess.run(['/bin/true'],check=True),lambda: os.symlink(secret,root/'escape')]:
 try:action()
 except PermissionError:checks.append(True)
 else:checks.append(False)
print(json.dumps({'profile':profile,'denied':checks}))
'''
    result = subprocess.run([sys.executable, '-c', code, str(job), str(secret)], capture_output=True,
                            text=True, timeout=5, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    assert all(output['denied']) and len(output['denied']) == 6
    assert output['profile']['landlockAbi'] >= 6
    assert (job / 'preview').read_text() == 'private derivative'
    assert secret.read_text() == 'PRIVATE_OTHER_JOB_SENTINEL'
    assert 'PRIVATE_OTHER_JOB_SENTINEL' not in result.stdout + result.stderr


def test_supported_kernel_probe_is_truthful():
    assert landlock_abi() >= 6
