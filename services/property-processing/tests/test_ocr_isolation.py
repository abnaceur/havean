import json
import os
import subprocess
import sys


def test_ocr_threads_inherit_private_file_network_and_process_denial(tmp_path):
    root=tmp_path/'job'
    root.mkdir()
    secret=tmp_path/'other-job-secret'
    secret.write_text('PRIVATE_OCR_FOREIGN_SENTINEL')
    code='''
import json,os,socket,subprocess,threading,sys
from pathlib import Path
from property_processing.decoder_isolation import enter_decoder_sandbox
root,secret=Path(sys.argv[1]),Path(sys.argv[2])
profile=enter_decoder_sandbox(root,ocr_models=True)
assert 'not a model weight' in Path('/opt/ocr-models/model-sentinel.txt').read_text()
checks=[]
def work():
 (root/'thread-output').write_text('private thread derivative')
 for action in [lambda:secret.read_text(),lambda:socket.socket(),lambda:subprocess.run(['/bin/true'],check=True),lambda:os.fork()]:
  try:action()
  except PermissionError:checks.append(True)
  else:checks.append(False)
thread=threading.Thread(target=work);thread.start();thread.join()
print(json.dumps({'profile':profile,'denied':checks}))
'''
    result=subprocess.run([sys.executable,'-c',code,str(root),str(secret)],capture_output=True,text=True,timeout=5,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    assert result.returncode==0,result.stderr
    data=json.loads(result.stdout)
    assert data['profile']['profile']=='linux-landlock-seccomp-ocr-v1'
    assert data['denied']==[True]*4
    assert (root/'thread-output').read_text()=='private thread derivative'
    assert 'PRIVATE_OCR_FOREIGN_SENTINEL' not in result.stdout+result.stderr
