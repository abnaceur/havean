import base64
import hashlib
import hmac
import json
import threading
import time
from datetime import datetime, timezone
from uuid import uuid4
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import pytest
from property_processing.executions import ExecutionAuthority, ExecutionError, ExecutionStore, canonical, digest, validate_request
from property_processing.server import make_server
from test_sources import pdf

SECRET = b'test-only-private-key-not-a-production-credential-0000'


def request(content):
    return {'schemaVersion': 1, 'executionId': str(uuid4()), 'organizationId': str(uuid4()),
            'runId': str(uuid4()), 'stageId': str(uuid4()), 'stageType': 'document_rasterize',
            'profileId': 'pdfium-150dpi-v1', 'inputRevision': 1, 'inputFingerprint': 'a'*64,
            'fencingToken': '1', 'artifacts': [{'id': str(uuid4()), 'checksum': hashlib.sha256(content).hexdigest(),
                                             'byteSize': str(len(content)), 'detectedMime': 'application/pdf'}],
            'deadline': datetime.fromtimestamp(time.time()+120, timezone.utc).isoformat().replace('+00:00', 'Z'),
            'budget': {'maxSeconds': 15, 'maxScratchBytes': str(64*1024*1024)}}


def grant(body, actions=None, expires=None):
    claims = {'aud': 'haven-processing-v1', 'executionId': body['executionId'], 'requestDigest': digest(body),
              'expiresAt': expires or time.time()+120, 'actions': actions or ['submit', 'read', 'cancel', 'source']}
    encoded = base64.urlsafe_b64encode(canonical(claims)).decode().rstrip('=')
    signature = hmac.new(SECRET, encoded.encode(), hashlib.sha256).digest()
    return encoded + '.' + base64.urlsafe_b64encode(signature).decode().rstrip('=')


def provision(root, body, content):
    directory = root / body['executionId']
    directory.mkdir(mode=0o700)
    (directory / body['artifacts'][0]['id']).write_bytes(content)
    return directory


def test_real_execution_is_durable_idempotent_and_preview_remains_private(tmp_path):
    content = pdf('Unit 00123')
    body = request(content)
    directory = provision(tmp_path, body, content)
    store = ExecutionStore(tmp_path)
    assert store.submit(body, digest(body))
    assert not store.submit(body, digest(body))
    # Restart before work; pending execution survives rather than becoming a second request.
    store = ExecutionStore(tmp_path)
    assert store.perform_one()
    result = store.get(body['executionId'], digest(body))
    assert result['state'] == 'succeeded'
    page = result['result']['pages'][0]
    assert '00123' in page['nativeText']
    assert hashlib.sha256((directory / page['previewFilename']).read_bytes()).hexdigest() == page['sha256']
    assert store.preview(body['executionId'], digest(body), page['sha256']) == (directory / page['previewFilename']).read_bytes()
    with pytest.raises(ExecutionError, match='EXECUTION_PREVIEW_NOT_FOUND'):
        store.preview(body['executionId'], digest(body), body['artifacts'][0]['checksum'])
    with pytest.raises(ExecutionError, match='EXECUTION_NOT_FOUND'):
        store.preview(body['executionId'], 'b'*64, page['sha256'])
    preview = directory / page['previewFilename']
    preview.write_bytes(b'\x89PNG\r\n\x1a\nforged')
    with pytest.raises(ExecutionError, match='EXECUTION_PREVIEW_INVALID'):
        store.preview(body['executionId'], digest(body), page['sha256'])
    preview.unlink()
    preview.symlink_to(directory / body['artifacts'][0]['id'])
    with pytest.raises(ExecutionError, match='EXECUTION_PREVIEW_INVALID'):
        store.preview(body['executionId'], digest(body), page['sha256'])
    assert not store.perform_one()
    changed = {**body, 'inputRevision': 2}
    with pytest.raises(ExecutionError, match='EXECUTION_ID_CONFLICT'):
        store.submit(changed, digest(changed))
    with pytest.raises(ExecutionError, match='EXECUTION_NOT_FOUND'):
        store.get(body['executionId'], 'b'*64)


def test_preview_grant_is_separate_from_source_and_status_read():
    body = request(pdf())
    authority = ExecutionAuthority(SECRET)
    with pytest.raises(ExecutionError, match='EXECUTION_UNAUTHORIZED'):
        authority.verify(grant(body, ['read']), body['executionId'], 'preview')
    assert authority.verify(grant(body, ['preview']), body['executionId'], 'preview') == digest(body)
    with pytest.raises(ExecutionError, match='EXECUTION_UNAUTHORIZED'):
        authority.verify(grant(body, ['preview']), body['executionId'], 'source')


@pytest.mark.parametrize('locale,text,expected', [('en', 'Unit number: 00123', '00123'), ('fr', 'Unit area: 184,20 m2', {'amount': '184.20', 'unit': 'm2', 'basis': 'document_unit_area'})])
def test_real_native_fact_profile_preserves_source_boxes_and_unknown_fields(tmp_path, locale, text, expected):
    content = pdf(text)
    body = request(content)
    body.update(stageType='fact_extract', profileId='generic-native-facts-'+locale+'-v1')
    provision(tmp_path, body, content)
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    assert store.perform_one()
    receipt = store.get(body['executionId'], digest(body))
    assert receipt['state'] == 'succeeded'
    result = receipt['result']
    assert result['reviewRequired'] and not result['ocrAvailable'] and result['countryProfile'] is None
    assert len(result['candidates']) == 1
    candidate = result['candidates'][0]
    assert candidate['normalizedValue'] == expected
    assert candidate['evidence'][0]['assetId'] == body['artifacts'][0]['id']
    assert candidate['evidence'][0]['bbox'] == result['pages'][0]['nativeLines'][0]['bbox']
    assert 'bedrooms' not in [item['field'] for item in result['candidates']]
    assert candidate['extractionScore'] is None
    assert store.preview(body['executionId'], digest(body), result['pages'][0]['sha256']).startswith(b'\x89PNG')


def test_real_native_profile_requests_ocr_without_inventing_a_draft(tmp_path):
    content = pdf('')
    body = request(content)
    body.update(stageType='fact_extract', profileId='generic-native-facts-ar-v1')
    provision(tmp_path, body, content)
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    assert store.perform_one()
    result = store.get(body['executionId'], digest(body))['result']
    assert result['candidates'] == [] and result['requiresOcrPages'] == [1]
    assert result['reviewRequired'] and not result['ocrAvailable']


def test_unknown_profiles_commands_and_budgets_do_not_run(tmp_path):
    body = request(pdf())
    for change in ({'stageType': 'shell'}, {'profileId': 'user-script'}, {'command': 'echo private'},
                   {'budget': {'maxSeconds': 16, 'maxScratchBytes': '123'}},
                   {'artifacts': [{**body['artifacts'][0], 'id': '../secret'}]}):
        with pytest.raises(ExecutionError):
            validate_request({**body, **change})
    store = ExecutionStore(tmp_path)
    directory = provision(tmp_path, body, pdf())
    store.submit(body, digest(body))
    (directory / body['artifacts'][0]['id']).unlink()
    assert store.perform_one()
    result = store.get(body['executionId'], digest(body))
    assert result['state'] == 'failed_terminal'
    assert result['errorCode'] == 'EXECUTION_FAILED'
    assert str(tmp_path) not in json.dumps(result)


def test_checksum_mismatch_and_cancelled_execution_never_succeed(tmp_path):
    content = pdf()
    body = request(content)
    provision(tmp_path, body, content[:-1] + b'x')
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    store.perform_one()
    assert store.get(body['executionId'], digest(body))['errorCode'] == 'SOURCE_OBJECT_MISMATCH'
    another = request(content)
    provision(tmp_path, another, content)
    store.submit(another, digest(another))
    assert store.cancel(another['executionId'], digest(another))['state'] == 'cancelled'
    assert not store.perform_one()
    assert store.get(another['executionId'], digest(another))['result'] is None


def test_interrupted_running_execution_is_reported_without_blind_restart(tmp_path):
    body = request(pdf())
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    with store.connect() as db:
        db.execute("UPDATE executions SET state='running'")
    recovered = ExecutionStore(tmp_path)
    assert recovered.get(body['executionId'], digest(body))['errorCode'] == 'RUNNER_INTERRUPTED'
    assert not recovered.perform_one()


def test_scoped_expiring_http_grants_and_duplicate_execution(tmp_path):
    body = request(pdf())
    authority, store = ExecutionAuthority(SECRET), ExecutionStore(tmp_path)
    server = make_server('127.0.0.1', 0, execution_store=store, execution_authority=authority)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_address[1]}'
    def submit(token, value):
        return urlopen(Request(origin+'/executions', data=canonical(value), headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'}), timeout=2)
    try:
        for token in ('invalid', grant(body, expires=time.time()-1), grant(body, actions=['read'])):
            with pytest.raises(HTTPError) as denied:
                submit(token, body)
            assert denied.value.code == 401
        with submit(grant(body), body) as accepted:
            assert accepted.status == 202
            assert json.load(accepted)['data']['state'] == 'awaiting_source'
        with submit(grant(body), body) as duplicate:
            assert duplicate.status == 202
        changed = {**body, 'inputRevision': 2}
        with pytest.raises(HTTPError) as conflict:
            submit(grant(changed), changed)
        assert conflict.value.code == 409
        stranger = request(pdf())
        with pytest.raises(HTTPError) as denied:
            urlopen(Request(origin+'/executions/'+body['executionId'], headers={'Authorization': 'Bearer '+grant(stranger)}), timeout=2)
        assert denied.value.code == 401
        with urlopen(Request(origin+'/executions/'+body['executionId']+'/cancel', data=b'', headers={'Authorization': 'Bearer '+grant(body)}), timeout=2) as cancelled:
            assert json.load(cancelled)['data']['state'] == 'cancelled'
        assert str(tmp_path) not in json.dumps(store.get(body['executionId'], digest(body)))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_cancel_wins_concurrent_late_completion_and_deletes_uncommitted_preview(tmp_path, monkeypatch):
    import property_processing.executions as module
    body = request(pdf())
    directory = provision(tmp_path, body, pdf())
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    started, release = threading.Event(), threading.Event()
    def late_decoder(*_args, **_kwargs):
        started.set()
        assert release.wait(2)
        # Exercise a race: a decoder writes after the cancel endpoint's first cleanup.
        (directory / ('page-001-' + 'c'*64 + '.png')).write_bytes(b'uncommitted')
        return {'pages': [], 'ocrAvailable': False}
    monkeypatch.setattr(module, 'inspect_source', late_decoder)
    worker = threading.Thread(target=store.perform_one)
    worker.start()
    assert started.wait(2)
    assert store.get(body['executionId'], digest(body))['processStopped'] is False
    store.cancel(body['executionId'], digest(body))
    assert store.get(body['executionId'], digest(body))['processStopped'] is False
    release.set()
    worker.join(timeout=3)
    assert not worker.is_alive()
    result = store.get(body['executionId'], digest(body))
    assert result['state'] == 'cancelled' and result['result'] is None
    assert result['processStopped'] is True
    assert not list(directory.glob('page-*.png'))


def test_real_image_declared_mime_mismatch_discards_uncommitted_derivative(tmp_path):
    from io import BytesIO
    from PIL import Image
    encoded = BytesIO()
    Image.new('RGB', (5, 3), 'white').save(encoded, format='PNG')
    body = request(encoded.getvalue())
    body['profileId'] = 'upright-image-v1'
    body['artifacts'][0]['detectedMime'] = 'image/jpeg'
    directory = provision(tmp_path, body, encoded.getvalue())
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    store.perform_one()
    result = store.get(body['executionId'], digest(body))
    assert result['state'] == 'failed_terminal' and result['errorCode'] == 'SOURCE_MIME_MISMATCH'
    assert result['result'] is None and not list(directory.glob('page-*.png'))


def test_configured_real_runner_process_accepts_quickly_and_completes_async(tmp_path):
    import os
    import subprocess
    import sys
    secret_file = tmp_path / 'runner-key'
    secret_file.write_bytes(SECRET)
    secret_file.chmod(0o600)
    root = tmp_path / 'receipts'
    root.mkdir(mode=0o700)
    content = pdf('Private asynchronous native text 00123')
    body = request(content)
    directory = root / body['executionId']
    environment = {**os.environ, 'PROCESSING_EXECUTION_ROOT': str(root),
                   'PROCESSING_SIGNING_KEY_FILE': str(secret_file), 'PROCESSING_ADAPTER': 'unavailable',
                   'PROCESSING_ENABLE_SIMULATOR': 'false', 'PROCESSING_DEPLOYMENT': 'test'}
    process = subprocess.Popen([sys.executable, '-m', 'property_processing.server'], env=environment,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    origin = 'http://127.0.0.1:8020'
    try:
        ready = time.monotonic()+5
        while True:
            assert process.poll() is None
            try:
                with urlopen(origin+'/health/ready', timeout=0.2) as ready_response:
                    capabilities = json.load(ready_response)["data"]["capabilities"]
                    assert capabilities["executionProtocolAvailable"]
                    assert capabilities["executionProfileIds"] == ["generic-native-facts-ar-v1", "generic-native-facts-en-v1", "generic-native-facts-fr-v1", "pdfium-150dpi-v1", "upright-image-v1"]
                    assert not capabilities["ocrAvailable"]
                    break
            except OSError:
                assert time.monotonic() < ready
                time.sleep(0.05)
        started = time.monotonic()
        with urlopen(Request(origin+'/executions', data=canonical(body), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer '+grant(body)}), timeout=2) as accepted:
            assert accepted.status == 202
        assert time.monotonic()-started < 2
        source_url = origin+'/executions/'+body['executionId']+'/sources/'+body['artifacts'][0]['id']
        with urlopen(Request(source_url, data=content, headers={'Content-Type': 'application/pdf', 'Authorization': 'Bearer '+grant(body)}), timeout=2) as stored:
            assert stored.status == 202
        deadline = time.monotonic()+8
        while True:
            with urlopen(Request(origin+'/executions/'+body['executionId'], headers={'Authorization': 'Bearer '+grant(body)}), timeout=2) as response:
                result = json.load(response)['data']
            if result['state'] not in ('pending', 'running'):
                break
            assert time.monotonic() < deadline
            time.sleep(0.05)
        assert result['state'] == 'succeeded'
        page = result['result']['pages'][0]
        assert '00123' in page['nativeText']
        assert (directory / page['previewFilename']).exists()
        with pytest.raises(HTTPError) as denied:
            urlopen(origin+'/'+page['previewFilename'], timeout=2)
        assert denied.value.code == 404
    finally:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


def test_source_transfer_is_scoped_checksum_bound_and_resumable_after_mismatch(tmp_path):
    from io import BytesIO
    content = pdf('Unit 00123')
    body = request(content)
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    assert store.get(body['executionId'], digest(body))['state'] == 'awaiting_source'
    assert not store.perform_one()
    for asset, data in ((str(uuid4()), content), (body['artifacts'][0]['id'], content[:-1]+b'x')):
        with pytest.raises(ExecutionError, match='EXECUTION_SOURCE_MISMATCH'):
            store.receive_source(body['executionId'], digest(body), asset, len(content), 'application/pdf', BytesIO(data))
    assert not list(tmp_path.rglob('source.partial'))
    result = store.receive_source(body['executionId'], digest(body), body['artifacts'][0]['id'], len(content), 'application/pdf', BytesIO(content))
    assert result['state'] == 'pending'
    assert store.perform_one()
    assert store.get(body['executionId'], digest(body))['state'] == 'succeeded'
    with pytest.raises(ExecutionError, match='EXECUTION_SOURCE_STATE_CONFLICT'):
        store.receive_source(body['executionId'], digest(body), body['artifacts'][0]['id'], len(content), 'application/pdf', BytesIO(content))


def test_interrupted_source_transfer_recovers_same_receipt_without_duplicate_work(tmp_path):
    content = pdf('Unit 00123')
    body = request(content)
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    directory = tmp_path / body['executionId']
    directory.mkdir()
    (directory / 'source.partial').write_bytes(b'incomplete')
    recovered = ExecutionStore(tmp_path)
    assert not (directory / 'source.partial').exists()
    assert recovered.get(body['executionId'], digest(body))['state'] == 'awaiting_source'
    # Crash after the durable rename but before the receipt transition.
    (directory / body['artifacts'][0]['id']).write_bytes(content)
    recovered = ExecutionStore(tmp_path)
    assert recovered.get(body['executionId'], digest(body))['state'] == 'pending'
    assert not recovered.submit(body, digest(body))
    assert recovered.perform_one()
    assert not recovered.perform_one()


def test_cleanup_reclaims_only_expired_stopped_scratch_and_keeps_receipts(tmp_path, monkeypatch):
    content = pdf()
    body = request(content)
    provision(tmp_path, body, content)
    store = ExecutionStore(tmp_path)
    assert store.submit(body, digest(body))
    store.cancel(body['executionId'], digest(body))
    deadline = datetime.fromisoformat(body['deadline'].replace('Z', '+00:00')).timestamp()
    monkeypatch.setattr(time, 'time', lambda: deadline+86401)
    # A cancellation state alone is not a process termination acknowledgement.
    store.active.add(body['executionId'])
    assert store.cleanup_expired() == 0
    assert (tmp_path / body['executionId']).is_dir()
    store.active.clear()
    assert store.cleanup_expired() == 1
    assert not (tmp_path / body['executionId']).exists()
    assert store.get(body['executionId'], digest(body))['state'] == 'cancelled'
    assert not store.submit(body, digest(body))  # Duplicate cannot start new work.
    assert store.cleanup_expired() == 0


def test_cleanup_retains_fresh_pending_and_ambiguous_interrupted_work(tmp_path, monkeypatch):
    content = pdf()
    bodies = [request(content) for _ in range(3)]
    store = ExecutionStore(tmp_path)
    for body in bodies:
        provision(tmp_path, body, content)
        store.submit(body, digest(body))
    store.cancel(bodies[0]['executionId'], digest(bodies[0]))
    assert store.cleanup_expired() == 0
    with store.connect() as db:
        db.execute("UPDATE executions SET state='failed_retryable',error='RUNNER_INTERRUPTED' WHERE id=?", (bodies[1]['executionId'],))
    fixed = time.time()+86530
    monkeypatch.setattr(time, 'time', lambda: fixed)
    assert store.cleanup_expired() == 1
    assert (tmp_path / bodies[1]['executionId']).exists()
    assert (tmp_path / bodies[2]['executionId']).exists()


def test_cleanup_refuses_execution_symlinks_and_expires_unreceived_sources(tmp_path, monkeypatch):
    store = ExecutionStore(tmp_path)
    body = request(pdf())
    store.submit(body, digest(body))
    outside = tmp_path / 'retained-outside'
    outside.mkdir()
    sentinel = outside / 'retained.txt'
    sentinel.write_text('Keep this non-execution directory')
    (tmp_path / body['executionId']).symlink_to(outside, target_is_directory=True)
    fixed = time.time()+130
    monkeypatch.setattr(time, 'time', lambda: fixed)
    assert store.cleanup_expired() == 0
    assert store.get(body['executionId'], digest(body))['errorCode'] == 'EXECUTION_DEADLINE_EXPIRED'
    later = fixed+86401
    monkeypatch.setattr(time, 'time', lambda: later)
    assert store.cleanup_expired() == 0
    assert sentinel.read_text() == 'Keep this non-execution directory'
