import base64
import hashlib
import json
from pathlib import Path
from PIL import Image
import pytest
from property_processing.media_frames import camera_metadata, extract_frames
from property_processing.sources import SourceError


def source(root):
    fixture = json.loads((Path(__file__).parent/'fixtures/media-frames-synthetic.json').read_text())
    body = base64.b64decode(fixture['file']['base64'])
    assert hashlib.sha256(body).hexdigest() == fixture['file']['sha256']
    name = fixture['file']['name']
    (root/name).write_bytes(body)
    return name


def test_actual_decoded_frame_timestamps_and_upright_quadrant_pixels_match_known_clip(tmp_path):
    name = source(tmp_path)
    result = extract_frames(tmp_path, name)
    assert [float(frame['timestampSeconds']) for frame in result['frames']] == [0, 1, 2]
    assert result['displayRotationDegrees'] == 90
    assert result['camera']['make'] is None
    assert result['camera']['lensModel'] is None
    assert result['camera']['intrinsics'] is None
    assert result['locationMetadataRetained'] is False
    for frame in result['frames']:
        numerator, denominator = map(int, frame['timeBase'].split('/'))
        assert int(frame['presentationTimestamp'])*numerator/denominator == float(frame['timestampSeconds'])
        assert frame['timestampBasis'] == 'decoded_input_pts'
        body = (tmp_path/frame['previewFilename']).read_bytes()
        assert hashlib.sha256(body).hexdigest() == frame['sha256']
        with Image.open(tmp_path/frame['previewFilename']) as image:
            assert image.size == (480, 640)
            assert image.info == {}
            for point, rgb in zip([(120, 160), (360, 160), (120, 480), (360, 480)], [(0, 255, 0), (255, 255, 0), (255, 0, 0), (0, 0, 255)]):
                assert max(abs(a-b) for a, b in zip(image.getpixel(point), rgb)) < 12


def test_camera_tags_are_private_unverified_and_absent_conflicting_or_invalid_values_stay_empty():
    assert camera_metadata({}) == {'make': None, 'model': None, 'lensModel': None, 'focalLengthMm': None, 'intrinsics': None, 'basis': 'container_tags_unverified'}
    result = camera_metadata({'format': {'tags': {'make': 'Synthetic camera', 'model': 'Fixture model', 'lens_model': 'Fixture lens', 'focal_length': '4.25', 'location': 'private GPS', 'serial_number': 'private device serial'}}})
    assert result['make'] == 'Synthetic camera' and result['focalLengthMm'] == '4.25'
    assert 'private' not in str(result)
    assert camera_metadata({'format': {'tags': {'make': 'one', 'com.apple.quicktime.make': 'two', 'focal_length': 'nan', 'lens_model': 'bad\nvalue'}}})['make'] is None
    assert camera_metadata({'format': {'tags': {'focal_length': 'nan', 'lens_model': 'bad\nvalue'}}})['focalLengthMm'] is None


def test_frame_source_symlink_and_existing_output_cannot_escape_or_overwrite(tmp_path):
    name = source(tmp_path)
    (tmp_path/'alias.mp4').symlink_to(tmp_path/name)
    with pytest.raises(SourceError, match='MEDIA_SOURCE_PATH_INVALID'):
        extract_frames(tmp_path, 'alias.mp4')
    (tmp_path/'frame-001.png').write_bytes(b'existing output')
    with pytest.raises(SourceError, match='MEDIA_OUTPUT_EXISTS'):
        extract_frames(tmp_path, name)
