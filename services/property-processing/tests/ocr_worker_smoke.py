"""Actual isolated OCR worker probe using existing self-authored PNG fixtures.

Run only in the offline investigation Compose image with the three pinned models.
This is not a customer/country benchmark or a production enablement command.
"""
import base64
from datetime import datetime,timezone,timedelta
import hashlib
import hmac
import io
import json
from pathlib import Path
import time
from uuid import uuid4
from property_processing.executions import ExecutionAuthority,ExecutionError,ExecutionStore,digest
from property_processing.ocr_sandbox import inspect_ocr
from property_processing.sources import SourceError
from property_processing.server import capabilities
from property_processing.ocr_facts import propose_ocr_facts


def main():
    assert capabilities()['ocrAvailable'] is False
    root=Path('/job')/('ocr-worker-'+str(uuid4()));root.mkdir(mode=0o700)
    store=ExecutionStore(root);authority=ExecutionAuthority(b'synthetic-private-test-key-not-a-production-credential-0000')
    records=[]
    expected={'en':'5a4e541a0b06a2ba33c88b19ad832c3dc2192f0d50916e58451f128d68ece481','fr':'0faa2a9fcc0a1f66bf0333042b3e838bf49371c23c521c353f1f872770ac456e','ar':'92ae9f8e742b6421adea72b0026bdd0881ae56fcdc6ff3db2d5a9721c40dc297'}
    def prepare(locale,seconds=15,document=None):
        body=document if document is not None else (Path('/job')/(locale+'.png')).read_bytes()
        checksum=hashlib.sha256(body).hexdigest()
        if document is None:assert checksum==expected[locale]
        kind='document' if document is not None else 'page';mime='application/pdf' if document is not None else 'image/png'
        request={'schemaVersion':1,'executionId':str(uuid4()),'organizationId':str(uuid4()),'runId':str(uuid4()),'stageId':str(uuid4()),'stageType':'document_ocr','profileId':'private-ocr-'+kind+'-'+locale+'-investigation-v1','inputRevision':1,'inputFingerprint':hashlib.sha256(b'synthetic scoped OCR investigation input').hexdigest(),'fencingToken':'1','artifacts':[{'id':str(uuid4()),'checksum':checksum,'byteSize':str(len(body)),'detectedMime':mime}],'deadline':(datetime.now(timezone.utc)+timedelta(seconds=120)).isoformat(),'budget':{'maxSeconds':seconds,'maxScratchBytes':str(64*1024**2)}}
        request_hash=digest(request);claims={'aud':'haven-processing-v1','executionId':request['executionId'],'requestDigest':request_hash,'expiresAt':time.time()+120,'actions':['submit','source','read','cancel']};encoded=base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=');signature=base64.urlsafe_b64encode(hmac.new(authority.secret,encoded.encode(),hashlib.sha256).digest()).decode().rstrip('=');token=encoded+'.'+signature
        for action in ['submit','source','read']:assert authority.verify(token,request['executionId'],action)==request_hash
        assert store.submit(request,request_hash) is True
        assert store.receive_source(request['executionId'],request_hash,request['artifacts'][0]['id'],len(body),mime,io.BytesIO(body))['state']=='pending'
        return request,request_hash
    for locale in expected:
        request,request_hash=prepare(locale);assert store.perform_one()
        receipt=store.get(request['executionId'],request_hash)
        assert receipt['state']=='succeeded',receipt['errorCode']
        result=receipt['result'];assert result['locale']==locale and result['sourceSha256']==expected[locale] and result['tokens'] and result['reviewRequired'] is True and result['scoreMethod']=='native_model_score_uncalibrated'
        assert result['isolation']['profile']=='linux-landlock-seccomp-ocr-v1'
        facts=propose_ocr_facts(result,expected[locale],locale)
        assert facts['reviewRequired'] is True
        assert all(candidate['field']!='bedrooms' and candidate['extractionScore'] is None for candidate in facts['candidates'])
        if locale=='en':
            assert facts['candidates'][0]['normalizedValue']['amount']=='123.45'
        else:
            # Actual French accent loss and Arabic unit corruption are retained
            # as raw tokens. Do not silently fix them into approved facts.
            assert facts['candidates']==[]
        assert store.submit(request,request_hash) is False
        restarted=ExecutionStore(root);assert restarted.get(request['executionId'],request_hash)==receipt
        altered={**request,'fencingToken':'2'}
        try:store.submit(altered,digest(altered));raise AssertionError('Conflicting execution accepted')
        except ExecutionError as error:assert error.code=='EXECUTION_ID_CONFLICT'
        records.append({'locale':locale,'sourceSha256':expected[locale],'tokens':result['tokens'],'factProposals':facts,'state':receipt['state'],'reviewRequired':True,'replayAndRestartVerified':True,'conflictingExecutionDenied':True,'isolation':result['isolation']})
    request,request_hash=prepare('en');source=root/request['executionId']/request['artifacts'][0]['id'];source.write_bytes(b'changed synthetic source');assert store.perform_one();tampered=store.get(request['executionId'],request_hash);assert tampered['state']=='failed_terminal' and tampered['result'] is None and tampered['errorCode']=='SOURCE_OBJECT_MISMATCH'
    # Actual supervision stops trusted startup/inference; late tokens are absent.
    for callback,timeout,code in [(None,0.1,'SOURCE_TIME_BUDGET_EXCEEDED'),(lambda:True,15,'SOURCE_CANCELLED')]:
        try:inspect_ocr(source.parent,source.name,'en',expected['en'],timeout=timeout,cancelled=callback);raise AssertionError('Bounded source supervision accepted late output')
        except SourceError as error:assert str(error)==code,str(error)
    from PIL import Image
    with Image.open('/job/en.png') as image:
        buffer=io.BytesIO();image.convert('RGB').save(buffer,format='PDF',resolution=150,save_all=True,append_images=[image.convert('RGB')])
    request,request_hash=prepare('en',document=buffer.getvalue());assert store.perform_one()
    document=store.get(request['executionId'],request_hash)
    assert document['state']=='succeeded',document['errorCode']
    extracted=document['result'];assert extracted['sourceSha256']==request['artifacts'][0]['checksum']
    assert [page['page'] for page in extracted['ocrPages']]==[1,2]
    assert len(extracted['candidates'])==2
    for index,candidate in enumerate(extracted['candidates'],1):
        assert candidate['normalizedValue']['amount']=='123.45' and candidate['extractionScore'] is None
        assert candidate['evidence'][0]['page']==index and candidate['evidence'][0]['assetId']==request['artifacts'][0]['id']
    assert ExecutionStore(root).get(request['executionId'],request_hash)==document
    print(json.dumps({'schemaVersion':1,'basis':'actual test-only durable worker and authored source pixels; no country/customer/calibrated accuracy or production approval','records':records,'document':{'sourceSha256':extracted['sourceSha256'],'pageLineageVerified':True,'restartedReceiptVerified':True,'candidates':extracted['candidates'],'ocrPages':extracted['ocrPages'],'privateResult':extracted},'tamperedSourceDenied':True,'deadlineAndCancellationStopped':True,'productionOcrEnabled':False},ensure_ascii=False))


if __name__=='__main__':
    main()
