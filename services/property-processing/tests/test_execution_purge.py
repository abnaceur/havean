import io
import json
import threading
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import pytest
from property_processing.executions import ExecutionAuthority, ExecutionError, ExecutionStore, digest
from property_processing.server import make_server
from test_executions import SECRET, grant, provision, request
from test_sources import pdf


def test_scoped_http_purge_removes_original_derivatives_and_ocr_result_but_keeps_tombstone(tmp_path):
    content = pdf('Unit number: 00123')
    body = request(content)
    body.update(stageType='fact_extract', profileId='generic-native-facts-en-v3')
    directory = provision(tmp_path, body, content)
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    assert store.perform_one()
    assert store.get(body['executionId'], digest(body))['result']['candidates']
    server = make_server('127.0.0.1', 0, execution_store=store, execution_authority=ExecutionAuthority(SECRET))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_address[1]}/executions/{body["executionId"]}/purge'
    try:
        with pytest.raises(HTTPError) as denied:
            urlopen(Request(url, data=b'{}', headers={'Authorization': 'Bearer '+grant(body, actions=['cancel'])}), timeout=2)
        assert denied.value.code == 401 and directory.exists()
        changed = {**body, 'inputRevision': 2}
        with pytest.raises(HTTPError) as denied:
            urlopen(Request(url, data=b'{}', headers={'Authorization': 'Bearer '+grant(changed, actions=['purge'])}), timeout=2)
        assert denied.value.code == 404 and directory.exists()
        for _ in range(2):
            with urlopen(Request(url, data=b'{}', headers={'Authorization': 'Bearer '+grant(body, actions=['purge'])}), timeout=2) as response:
                result = json.load(response)['data']
            assert result['scratchPurged'] and result['processStopped'] and result['result'] is None
            assert result['state'] == 'cancelled' and not directory.exists()
        assert not store.submit(body, digest(body))
        with pytest.raises(ExecutionError, match='EXECUTION_SOURCE_STATE_CONFLICT'):
            store.receive_source(body['executionId'], digest(body), body['artifacts'][0]['id'], len(content), 'application/pdf', io.BytesIO(content))
        assert store.db_path.is_file()
        assert b'Unit number: 00123' not in store.db_path.read_bytes()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_purge_refuses_active_decoder_and_inflight_source_then_cleans_after_stop(tmp_path):
    content = pdf()
    body = request(content)
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    entered, release = threading.Event(), threading.Event()
    errors = []
    class SlowSource(io.BytesIO):
        def read(self, size=-1):
            entered.set()
            assert release.wait(3)
            return super().read(size)
    def transfer():
        try:
            store.receive_source(body['executionId'], digest(body), body['artifacts'][0]['id'], len(content), 'application/pdf', SlowSource(content))
        except ExecutionError as error:
            errors.append(error.code)
    thread = threading.Thread(target=transfer)
    thread.start()
    assert entered.wait(2)
    store.cancel(body['executionId'], digest(body))
    assert not store.get(body['executionId'], digest(body))['processStopped']
    with pytest.raises(ExecutionError, match='EXECUTION_PURGE_NOT_STOPPED'):
        store.purge(body['executionId'], digest(body))
    release.set()
    thread.join(timeout=3)
    assert errors == ['EXECUTION_SOURCE_STATE_CONFLICT']
    store.active.add(body['executionId'])
    with pytest.raises(ExecutionError, match='EXECUTION_PURGE_NOT_STOPPED'):
        store.purge(body['executionId'], digest(body))
    store.active.clear()
    assert store.purge(body['executionId'], digest(body))['scratchPurged']
    assert not (tmp_path/body['executionId']).exists()


def test_purge_refuses_symlink_without_touching_outside_files(tmp_path):
    content = pdf()
    body = request(content)
    root = tmp_path/'jobs'
    root.mkdir()
    outside = tmp_path/'outside'
    outside.mkdir()
    (outside/'keep').write_bytes(content)
    store = ExecutionStore(root)
    store.submit(body, digest(body))
    store.cancel(body['executionId'], digest(body))
    (root/body['executionId']).symlink_to(outside, target_is_directory=True)
    with pytest.raises(ExecutionError, match='EXECUTION_CLEANUP_INVALID'):
        store.purge(body['executionId'], digest(body))
    assert (outside/'keep').read_bytes() == content


def test_expired_unsubmitted_execution_gets_durable_purge_tombstone(tmp_path):
    body = request(pdf())
    body['deadline'] = datetime.fromtimestamp(time.time()-60, timezone.utc).isoformat().replace('+00:00', 'Z')
    store = ExecutionStore(tmp_path)
    assert store.purge(body['executionId'], digest(body), body)['scratchPurged']
    assert not store.submit(body, digest(body))
    assert not store.perform_one()


def test_purge_commits_cancellation_before_active_process_retry(tmp_path):
    body = request(pdf())
    store = ExecutionStore(tmp_path)
    store.submit(body, digest(body))
    store.active.add(body['executionId'])
    with pytest.raises(ExecutionError, match='EXECUTION_PURGE_NOT_STOPPED'):
        store.purge(body['executionId'], digest(body), body)
    assert store.get(body['executionId'], digest(body))['state'] == 'cancelled'
    store.active.clear()
    assert store.purge(body['executionId'], digest(body), body)['scratchPurged']
