"""One actual CPU solve through durable execution, replay, scoped export and purge."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from uuid import uuid4
from property_processing.executions import ExecutionStore, ExecutionError, digest
from property_processing.camera_execution import unpack_frames

source = Path('/input')
content = io.BytesIO()
with tarfile.open(fileobj=content, mode='w', format=tarfile.USTAR_FORMAT) as archive:
    for path in [source / 'manifest.json', *sorted((source / 'frames').glob('*.png'))]:
        info = tarfile.TarInfo(str(path.relative_to(source)))
        info.size, info.mode = path.stat().st_size, 0o600
        with path.open('rb') as data:
            archive.addfile(info, data)
body = content.getvalue()
with tempfile.TemporaryDirectory(dir='/jobs') as scratch:
    root = Path(scratch)
    request = {'schemaVersion': 1, 'executionId': str(uuid4()), 'organizationId': str(uuid4()),
               'runId': str(uuid4()), 'stageId': str(uuid4()), 'stageType': 'camera_solve',
               'profileId': 'private-colmap-cpu-investigation-v1', 'inputRevision': 1,
               'inputFingerprint': 'a'*64, 'fencingToken': '1',
               'artifacts': [{'id': str(uuid4()), 'checksum': hashlib.sha256(body).hexdigest(), 'byteSize': str(len(body)), 'detectedMime': 'application/x-tar'}],
               'deadline': datetime.fromtimestamp(time.time()+600, timezone.utc).isoformat().replace('+00:00', 'Z'),
               'budget': {'maxSeconds': 240, 'maxScratchBytes': str(512*1024*1024)}}
    store = ExecutionStore(root)
    key = digest(request)
    assert store.submit(request, key)
    store.receive_source(request['executionId'], key, request['artifacts'][0]['id'], len(body), 'application/x-tar', io.BytesIO(body))
    store = ExecutionStore(root)
    assert store.perform_one()
    receipt = store.get(request['executionId'], key)
    assert receipt['state'] == 'succeeded', receipt
    result = receipt['result']
    assert result['report']['state'] == 'awaiting_review', result
    assert result['report']['nativeIsolationProfile'] == 'linux-landlock-seccomp-colmap-v1'
    assert result['trainingArchive']['datasetFingerprint'] == result['report']['trainingInput']['datasetFingerprint']
    archive = store.training_archive(request['executionId'], key, result['trainingArchive']['sha256'])
    assert hashlib.sha256(archive).hexdigest() == result['trainingArchive']['sha256']
    assert not store.submit(request, key) and not store.perform_one()
    try:
        store.training_archive(request['executionId'], 'b'*64, result['trainingArchive']['sha256'])
        raise AssertionError('Foreign receipt read')
    except ExecutionError:
        pass
    assert store.purge(request['executionId'], key)['scratchPurged']
    assert store.get(request['executionId'], key)['result'] is None
    assert not (root / request['executionId']).exists()
    # Reject traversal at the archive boundary, without invoking native work.
    invalid = root / 'invalid.tar'
    with tarfile.open(invalid, 'w') as archive:
        info = tarfile.TarInfo('../foreign')
        info.size = 1
        archive.addfile(info, io.BytesIO(b'x'))
    try:
        unpack_frames(invalid, root / 'invalid-input')
        raise AssertionError('Archive traversal accepted')
    except ValueError:
        pass
    print(json.dumps({'state': 'passed', 'actualCameraCount': result['report']['models'][0]['registeredCameraCount'],
                      'trainingViews': result['report']['trainingInput']['viewCount'], 'measurements': result['report']['measurements'],
                      'durableReplay': True, 'scopedArchive': True, 'purged': True, 'archiveTraversalRejected': True}, sort_keys=True))
