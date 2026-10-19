"""Private offline OCR token CLI. Not enabled in the production worker manifest.

Scores are native model scores, never calibrated fact accuracy. This port emits
raw source-linked tokens only; it cannot invent missing fixed form fields.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import stat

MODELS={'en':'en_PP-OCRv4_mobile_rec','fr':'latin_PP-OCRv3_mobile_rec','ar':'arabic_PP-OCRv3_mobile_rec'}


def _recognize(directory, name, locale, source_sha256, page=1):
    if locale not in MODELS or Path(name).name != name or not isinstance(page,int) or isinstance(page,bool) or not 1 <= page <= 50:
        raise ValueError('Explicit supported locale and bounded source page required')
    root=Path(directory).resolve(strict=True)
    models=Path('/opt/ocr-models')
    native=models/'native'
    if native.exists():
        import re
        native_pins=json.loads((native/'pins.json').read_text())['libraries']
        for filename,record in native_pins.items():
            if not re.fullmatch(r'[A-Za-z0-9_+.-]+\.so(?:\.[0-9]+)*',filename) or (native/filename).is_symlink() or hashlib.sha256((native/filename).read_bytes()).hexdigest()!=record['sha256']:
                raise ValueError('Native OCR import library checksum mismatch')
            if filename in ('libiomp5.so','libmklml_intel.so','libblas.so.3','liblapack.so.3') and hashlib.sha256((Path('/usr/local/lib/python3.12/site-packages/paddle/libs')/filename).read_bytes()).hexdigest()!=record['sha256']:
                raise ValueError('Unmodified native OCR runtime library required')
    pins=json.loads((models/'pins.json').read_text())
    for model in ['PP-OCRv5_mobile_det',MODELS[locale]]:
        for filename,record in pins[model]['artifacts'].items():
            path=models/model/filename
            if Path(filename).name!=filename or path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=record['sha256']:
                raise ValueError('Exact offline model files required')
    resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
    resource.setrlimit(resource.RLIMIT_CPU,(90,90))
    resource.setrlimit(resource.RLIMIT_FSIZE,(32*1024**2,32*1024**2))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    for key,value in {'HOME':str(root),'TMPDIR':str(root),'XDG_CACHE_HOME':str(root/'cache'),'PADDLE_HOME':str(root/'cache'),'PADDLE_PDX_CACHE_HOME':str(root/'cache'),'PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK':'True','HF_HUB_OFFLINE':'1','OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1','PYTHONDONTWRITEBYTECODE':'1'}.items():
        os.environ[key]=value
    # Trusted library startup probes libc/AVX using fixed subprocesses. No source
    # pixels are opened before confinement. Existing threads would escape the
    # subsequently inherited kernel rules, so refuse them rather than weakening
    # process/exec/network denial for OCR input parsing or inference.
    from PIL import Image
    import numpy as np
    import importlib
    importlib.import_module('paddle')
    from paddleocr import PaddleOCR
    if len(os.listdir('/proc/self/task'))!=1:
        raise ValueError('Single-threaded trusted OCR startup required before confinement')
    from .decoder_isolation import enter_decoder_sandbox
    isolation=enter_decoder_sandbox(root,ocr_models=True)
    fd=os.open(root/name,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise ValueError('Regular private raster source required')
        body=handle.read(16*1024**2+1)
    if len(body)>16*1024**2 or hashlib.sha256(body).hexdigest()!=source_sha256:
        raise ValueError('Private OCR source checksum or byte budget mismatch')
    import io
    Image.MAX_IMAGE_PIXELS=4*1024**2
    image=Image.open(io.BytesIO(body))
    if image.format!='PNG' or image.width*image.height>4*1024**2 or getattr(image,'n_frames',1)!=1 or image.info.get('exif') or image.info.get('xmp'):
        raise ValueError('Bounded upright page PNG required')
    width,height=image.size
    ocr=PaddleOCR(text_detection_model_name='PP-OCRv5_mobile_det',text_detection_model_dir=str(models/'PP-OCRv5_mobile_det'),text_recognition_model_name=MODELS[locale],text_recognition_model_dir=str(models/MODELS[locale]),use_doc_orientation_classify=False,use_doc_unwarping=False,use_textline_orientation=False,device='cpu',cpu_threads=1,enable_mkldnn=False,text_rec_score_thresh=0.1)
    tokens=[]
    for output in ocr.predict(np.asarray(image.convert('RGB'))):
        if not len(output['rec_texts'])==len(output['rec_scores'])==len(output['rec_polys']):
            raise ValueError('OCR output shape mismatch')
        for text,score,polygon in zip(output['rec_texts'],output['rec_scores'],output['rec_polys']):
            normalized=[[float(x)/width,float(y)/height] for x,y in polygon]
            if not isinstance(text,str) or not text or len(text)>2000 or not math.isfinite(float(score)) or not 0<=float(score)<=1 or len(normalized)!=4 or any(not math.isfinite(value) or not 0<=value<=1 for point in normalized for value in point):
                raise ValueError('Invalid source-linked OCR token output')
            tokens.append({'text':text,'score':float(score),'polygon':normalized})
            if len(tokens)>5000:
                raise ValueError('OCR token budget exceeded')
    return {'schemaVersion':1,'locale':locale,'sourceSha256':source_sha256,'page':page,'coordinateSpace':'upright-page-normalized-top-left','width':width,'height':height,'tokens':tokens,'scoreMethod':'native_model_score_uncalibrated','reviewRequired':True,'isolation':isolation}


def recognize(directory,name,locale,source_sha256,page=1):
    import contextlib
    import sys
    with contextlib.redirect_stdout(sys.stderr):
        return _recognize(directory,name,locale,source_sha256,page)


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--directory',required=True)
    parser.add_argument('--name',required=True)
    parser.add_argument('--locale',choices=MODELS,required=True)
    parser.add_argument('--sha256',required=True)
    parser.add_argument('--page',type=int,default=1)
    args=parser.parse_args()
    print(json.dumps(recognize(args.directory,args.name,args.locale,args.sha256,args.page),ensure_ascii=False))
