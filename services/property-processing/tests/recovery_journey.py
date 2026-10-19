"""Actual confined PDF/recovery journey, with authored source and public test key."""
import base64
import hashlib
import hmac
import http.client
import json
import os
import sys
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from property_processing.executions import canonical, digest

ROOT = Path('/fixture')
KEY = b'test-only-private-key-not-a-production-credential-0000'
SOURCE_HOST = os.environ['RECOVERY_SOURCE_HOST']
RESTORED_HOST = os.environ['RECOVERY_RESTORED_HOST']


def grant(body, action):
    claims = {'aud': 'haven-processing-v1', 'executionId': body['executionId'],
              'requestDigest': digest(body), 'expiresAt': time.time()+120, 'actions': [action]}
    encoded = base64.urlsafe_b64encode(canonical(claims)).decode().rstrip('=')
    return encoded+'.'+base64.urlsafe_b64encode(hmac.new(KEY, encoded.encode(), hashlib.sha256).digest()).decode().rstrip('=')


def call(host, body, action, suffix='', content=None):
    method = 'GET' if action in ('read', 'preview') else 'POST'
    req = Request('http://'+host+':8020/executions'+suffix, data=content, method=method,
                  headers={'Authorization': 'Bearer '+grant(body, action), 'Content-Type': 'application/pdf' if action == 'source' else 'application/json'})
    with urlopen(req, timeout=5) as response:
        encoded = response.read()
        return encoded if action == 'preview' else json.loads(encoded)['data']


def wait_ready(host):
    until = time.time()+10
    while True:
        try:
            with urlopen('http://'+host+':8020/health/ready', timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, HTTPError):
            pass
        if time.time() > until:
            raise RuntimeError('RECOVERY_TEST_RUNNER_NOT_READY')
        time.sleep(.1)


def prepare():
    writer = PdfWriter()
    page = writer.add_blank_page(300, 300)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b'BT /F1 12 Tf 20 150 Td (Unit number: 00123) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    encoded = BytesIO()
    writer.write(encoded)
    content = encoded.getvalue()
    request = {'schemaVersion': 1, 'executionId': str(uuid4()), 'organizationId': str(uuid4()),
               'runId': str(uuid4()), 'stageId': str(uuid4()), 'stageType': 'document_rasterize',
               'profileId': 'pdfium-150dpi-v1', 'inputRevision': 1, 'inputFingerprint': 'a'*64,
               'fencingToken': '1', 'artifacts': [{'id': str(uuid4()), 'checksum': hashlib.sha256(content).hexdigest(), 'byteSize': str(len(content)), 'detectedMime': 'application/pdf'}],
               'deadline': datetime.fromtimestamp(time.time()+3600, timezone.utc).isoformat().replace('+00:00', 'Z'),
               'budget': {'maxSeconds': 15, 'maxScratchBytes': str(64*1024*1024)}}
    deleted = {**request, 'executionId': str(uuid4()), 'stageId': str(uuid4())}
    completed = {**request, 'executionId': str(uuid4()), 'stageId': str(uuid4())}
    (ROOT/'source.pdf').write_bytes(content)
    (ROOT/'requests.json').write_text(json.dumps({'pending': request, 'deleted': deleted, 'completed': completed}))
    print('Authored actual PDF/request fixture prepared.', flush=True)


def interrupt():
    wait_ready(SOURCE_HOST)
    requests = json.loads((ROOT/'requests.json').read_text())
    body, deleted = requests['pending'], requests['deleted']
    completed = requests['completed']
    call(SOURCE_HOST, completed, 'submit', content=canonical(completed))
    call(SOURCE_HOST, completed, 'source', '/'+completed['executionId']+'/sources/'+completed['artifacts'][0]['id'], (ROOT/'source.pdf').read_bytes())
    until = time.time()+20
    while True:
        done = call(SOURCE_HOST, completed, 'read', '/'+completed['executionId'])
        if done['state'] == 'succeeded':
            break
        assert done['state'] in ('pending', 'running')
        if time.time() > until:
            raise RuntimeError('RECOVERY_TEST_INITIAL_DECODE_TIMED_OUT')
        time.sleep(.1)
    (ROOT/'completed-result.json').write_text(json.dumps({'digest': hashlib.sha256(canonical(done['result'])).hexdigest(), 'preview': done['result']['pages'][0]['sha256']}))
    preview = call(SOURCE_HOST, completed, 'preview', '/'+completed['executionId']+'/previews/'+done['result']['pages'][0]['sha256'])
    assert hashlib.sha256(preview).hexdigest() == done['result']['pages'][0]['sha256']
    (ROOT/'actual-source-preview.png').write_bytes(preview)
    tombstone = call(SOURCE_HOST, deleted, 'purge', '/'+deleted['executionId']+'/purge', canonical(deleted))
    assert tombstone['state'] == 'cancelled' and tombstone['scratchPurged']
    assert call(SOURCE_HOST, body, 'submit', content=canonical(body))['state'] == 'awaiting_source'
    content = (ROOT/'source.pdf').read_bytes()
    connection = http.client.HTTPConnection(SOURCE_HOST, 8020, timeout=20)
    connection.putrequest('POST', '/executions/'+body['executionId']+'/sources/'+body['artifacts'][0]['id'])
    connection.putheader('Authorization', 'Bearer '+grant(body, 'source'))
    connection.putheader('Content-Type', 'application/pdf')
    connection.putheader('Content-Length', str(len(content)))
    connection.endheaders()
    connection.send(content[:len(content)//2])
    (ROOT/'partial-ready').write_text(body['executionId'])
    print('Actual incomplete upload submitted; awaiting runner crash.', flush=True)
    time.sleep(20)
    connection.close()


def verify():
    wait_ready(RESTORED_HOST)
    requests = json.loads((ROOT/'requests.json').read_text())
    body, deleted = requests['pending'], requests['deleted']
    completed = requests['completed']
    recorded = json.loads((ROOT/'completed-result.json').read_text())
    saved = call(RESTORED_HOST, completed, 'read', '/'+completed['executionId'])
    assert saved['state'] == 'succeeded' and hashlib.sha256(canonical(saved['result'])).hexdigest() == recorded['digest']
    saved_preview = call(RESTORED_HOST, completed, 'preview', '/'+completed['executionId']+'/previews/'+recorded['preview'])
    assert hashlib.sha256(saved_preview).hexdigest() == recorded['preview']
    assert call(RESTORED_HOST, body, 'read', '/'+body['executionId'])['state'] == 'awaiting_source'
    assert call(RESTORED_HOST, deleted, 'read', '/'+deleted['executionId'])['state'] == 'cancelled'
    assert call(RESTORED_HOST, deleted, 'submit', content=canonical(deleted))['state'] == 'cancelled'
    assert call(RESTORED_HOST, body, 'submit', content=canonical(body))['state'] == 'awaiting_source'
    call(RESTORED_HOST, body, 'source', '/'+body['executionId']+'/sources/'+body['artifacts'][0]['id'], (ROOT/'source.pdf').read_bytes())
    until = time.time()+20
    while True:
        receipt = call(RESTORED_HOST, body, 'read', '/'+body['executionId'])
        if receipt['state'] == 'succeeded':
            break
        assert receipt['state'] in ('pending', 'running'), receipt['state']
        if time.time() > until:
            raise RuntimeError('RECOVERY_TEST_DECODE_TIMED_OUT')
        time.sleep(.1)
    page = receipt['result']['pages'][0]
    assert '00123' in page['nativeText']
    preview = call(RESTORED_HOST, body, 'preview', '/'+body['executionId']+'/previews/'+page['sha256'])
    assert preview.startswith(b'\x89PNG') and hashlib.sha256(preview).hexdigest() == page['sha256']
    replay = call(RESTORED_HOST, body, 'submit', content=canonical(body))
    assert replay['state'] == 'succeeded' and replay['executionId'] == receipt['executionId'] and replay['result'] == receipt['result']
    changed = {**body, 'inputRevision': 2}
    try:
        call(RESTORED_HOST, changed, 'submit', content=canonical(changed))
    except HTTPError as error:
        assert error.code == 409
    else:
        raise AssertionError('RECOVERY_TEST_SCOPE_REPLACEMENT_ACCEPTED')
    print(json.dumps({'label': 'P', 'actualDecoder': True, 'authenticatedVolumeRestore': True,
                      'interruptedSourceUploadRecovered': True, 'deletionTombstoneRetained': True,
                      'completedResultAndPreviewRecovered': True, 'sourcePreviewHashVerified': True, 'staleRequestRejected': True, 'duplicateExecution': False}), flush=True)


{'prepare': prepare, 'interrupt': interrupt, 'verify': verify}[sys.argv[1]]()
