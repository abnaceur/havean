"""One real calibrated CPU output handoff; no CUDA or trained-scene claim."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile

from property_processing.camera_execution import pack_training
from property_processing.training_archive import training_input
from property_processing.training_data import load_training_dataset

source = Path('/results/tum-xyz-training-prepared-v2/training-input')
expected = load_training_dataset(source)
with tempfile.TemporaryDirectory() as scratch:
    directory = Path(scratch)
    record = pack_training(source, directory / 'training.partial', 100*1024*1024)
    archive = directory / ('camera-training-' + record['sha256'] + '.tar')
    with training_input(archive, archive_sha256=record['sha256'], dataset_fingerprint=expected['fingerprint']) as prepared:
        assert prepared != source
        actual = load_training_dataset(prepared)
        assert actual['fingerprint'] == expected['fingerprint']
        assert len(actual['views']) == 16
        extracted = prepared
    assert not extracted.exists()
    try:
        with training_input(archive, archive_sha256='0'*64):
            raise AssertionError('Substituted archive accepted')
    except ValueError as error:
        assert 'checksum mismatch' in str(error)
    invalid = directory / 'invalid.tar'
    with tarfile.open(invalid, 'w', format=tarfile.USTAR_FORMAT) as handle:
        info = tarfile.TarInfo('../escape')
        info.size = 1
        handle.addfile(info, io.BytesIO(b'x'))
    try:
        with training_input(invalid, archive_sha256=hashlib.sha256(invalid.read_bytes()).hexdigest()):
            raise AssertionError('Traversal accepted')
    except ValueError as error:
        assert 'Canonical calibrated archive members' in str(error)
    assert not (directory.parent / 'escape').exists()
    print(json.dumps({'state': 'passed', 'actualCalibratedViews': len(actual['views']),
                      'datasetFingerprint': actual['fingerprint'], 'byteSize': record['byteSize'],
                      'checksumRefusal': True, 'traversalRefusal': True, 'temporaryPixelsRemoved': True,
                      'gpuTrainingVerified': False}))
