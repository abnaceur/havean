"""Bounded OCR process port. Production OCR capability remains disabled."""
from pathlib import Path
import re
import sys
from .sources import SourceError
from .source_sandbox import supervise_source


def inspect_ocr(directory, name, locale, source_sha256, *, timeout=15, cancelled=None):
    if locale not in ('en', 'fr', 'ar') or not isinstance(source_sha256, str) or not re.fullmatch(r'[a-f0-9]{64}', source_sha256) or isinstance(timeout,bool) or not isinstance(timeout,(int,float)) or not 0 < timeout <= 15:
        raise SourceError('SOURCE_OCR_PROFILE_INVALID')
    try:
        root=Path(directory).resolve(strict=True)
        source=root/name
        if Path(name).name!=name or source.is_symlink() or not source.is_file() or source.resolve(strict=True).parent!=root:
            raise SourceError('SOURCE_PATH_INVALID')
    except (OSError,TypeError,ValueError):
        raise SourceError('SOURCE_PATH_INVALID') from None
    command=[sys.executable,'-m','property_processing.ocr_cli',str(root),name,locale,source_sha256]
    environment={'PATH':'/usr/local/bin:/usr/bin:/bin','PYTHONPATH':str(Path(__file__).resolve().parent.parent),'PYTHONDONTWRITEBYTECODE':'1','PYTHONUNBUFFERED':'1','LD_LIBRARY_PATH':'/opt/ocr-models/native','OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1','HF_HUB_OFFLINE':'1','PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK':'True'}
    result=supervise_source(command,environment,timeout=timeout,output_limit=16*1024*1024,cancelled=cancelled)
    if result.get('sourceSha256')!=source_sha256 or result.get('locale')!=locale or result.get('page')!=1 or result.get('reviewRequired') is not True or result.get('scoreMethod')!='native_model_score_uncalibrated' or result.get('isolation',{}).get('profile')!='linux-landlock-seccomp-ocr-v1':
        raise SourceError('SOURCE_OCR_RESULT_INVALID')
    return result
