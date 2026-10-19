import hashlib
from pathlib import Path
import subprocess
import sys
import pytest
from property_processing.ocr_sandbox import inspect_ocr
from property_processing.sources import SourceError


def test_ocr_supervision_refuses_profile_budget_path_and_symlink_without_inference(tmp_path):
    source=tmp_path/'source.png';source.write_bytes(b'self-authored guard fixture');checksum=hashlib.sha256(source.read_bytes()).hexdigest()
    for locale,digest,timeout in [('xx',checksum,15),('en','not-a-sha',15),('en',checksum,16),('en',checksum,True)]:
        with pytest.raises(SourceError,match='SOURCE_OCR_PROFILE_INVALID'):
            inspect_ocr(tmp_path,'source.png',locale,digest,timeout=timeout)
    alias=tmp_path/'alias.png';alias.symlink_to(source)
    for name in ['../source.png','alias.png','missing.png']:
        with pytest.raises(SourceError,match='SOURCE_PATH_INVALID'):
            inspect_ocr(tmp_path,name,'en',checksum)


def test_ocr_investigation_profiles_require_explicit_test_deployment_even_when_flag_set():
    script="from property_processing.executions import PROFILES; print(','.join(sorted(k for k in PROFILES if '-ocr-page-' in k or '-ocr-document-' in k)))"
    for deployment,enabled in [('development','true'),('production','true'),('test','false'),('test','true')]:
        result=subprocess.run([sys.executable,'-c',script],capture_output=True,text=True,check=True,env={'PATH':'/usr/local/bin:/usr/bin:/bin','PYTHONPATH':str(Path(__file__).resolve().parent.parent),'PROCESSING_DEPLOYMENT':deployment,'PROCESSING_ENABLE_OCR_INVESTIGATION':enabled})
        if deployment=='test' and enabled=='true':assert result.stdout.strip().split(',')==sorted('private-ocr-'+kind+'-'+locale+'-investigation-v1' for kind in ['page','document'] for locale in ['ar','en','fr'])
        else:assert result.stdout.strip()==''
