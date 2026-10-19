import hashlib
import json
import uuid

import pytest
from PIL import Image

from property_processing.gsplat_training import bounded_profile, train
from property_processing.training_data import load_training_dataset, separated_views, quaternion_matrix, UnusableCalibrationError


def fixture(root):
    (root / 'images').mkdir()
    (root / 'sparse').mkdir()
    frames, images = [], []
    for index in range(16):
        name = str(uuid.UUID(int=index)) + '.png'
        path = root / 'images' / name
        Image.new('RGB', (32, 24), (index * 10, 20, 30)).save(path)
        frames.append({'name': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'width': 32, 'height': 24, 'cameraGroupId': 'clip', 'timestampSeconds': str(index)})
        images.append(f'{index + 1} 1 0 0 0 {index / 10} 0 0 1 {name}\n' + ' '.join(f'{p} {p} {p+1}' for p in range(16)) + '\n')
    (root / 'sparse/cameras.txt').write_text('1 PINHOLE 32 24 30 30 16 12\n')
    (root / 'sparse/images.txt').write_text(''.join(images))
    (root / 'sparse/points3D.txt').write_text(''.join(f'{p+1} {p/10} {p/20} {p/30+3} 128 128 128 .5 ' + ' '.join(f'{i+1} {p}' for i in range(16)) + '\n' for p in range(16)))
    manifest = {'schemaVersion': 1, 'frames': frames, 'privacyReviewRequired': True, 'publiclyServed': False}
    (root / 'manifest.json').write_text(json.dumps(manifest))
    return manifest


def test_actual_calibrated_pngs_tracks_and_fingerprints_are_bound(tmp_path):
    fixture(tmp_path)
    result = load_training_dataset(tmp_path)
    assert len(result['views']) == 16 and len(result['points']) == 16
    assert result['views'][1]['viewmat'][0] == [1, 0, 0, .1]
    assert result['views'][0]['K'] == [[30, 0, 16], [0, 30, 12], [0, 0, 1]]
    assert result['split']['heldOut'] == [4, 12]
    assert result['split']['excludedNeighbours'] == [3, 5, 11, 13]
    assert result['scale'] is None and result['publiclyServed'] is False
    original = result['fingerprint']
    path = tmp_path / 'sparse/cameras.txt'
    path.write_text(path.read_text().replace('30 30', '31 31'))
    assert load_training_dataset(tmp_path)['fingerprint'] != original


@pytest.mark.parametrize('kind', ['hash', 'intrinsics', 'distortion', 'dimensions', 'scope', 'timestamp', 'symlink'])
def test_substituted_or_uncalibrated_inputs_fail(tmp_path, kind):
    manifest = fixture(tmp_path)
    if kind == 'hash':
        manifest['frames'][0]['sha256'] = '0' * 64
    elif kind == 'intrinsics':
        (tmp_path / 'sparse/cameras.txt').write_text('1 PINHOLE 32 24 -30 30 16 12\n')
    elif kind == 'distortion':
        (tmp_path / 'sparse/cameras.txt').write_text('1 SIMPLE_RADIAL 32 24 30 16 12 .01\n')
    elif kind == 'dimensions':
        manifest['frames'][0]['width'] = 31
    elif kind == 'scope':
        manifest['publiclyServed'] = True
    elif kind == 'timestamp':
        manifest['frames'][0]['timestampSeconds'] = '1'
    else:
        path = tmp_path / 'images' / manifest['frames'][0]['name']
        path.unlink()
        path.symlink_to(tmp_path / 'images' / manifest['frames'][1]['name'])
    (tmp_path / 'manifest.json').write_text(json.dumps(manifest))
    with pytest.raises(ValueError):
        load_training_dataset(tmp_path)


def test_temporal_blocks_per_group_preserve_neighbour_gap_and_reject_tiny_dataset():
    frames = [{'cameraGroupId': str(i // 8), 'timestampSeconds': str(i)} for i in range(16)]
    result = separated_views(frames)
    assert result['heldOut'] == [4, 12]
    assert all(abs(training - held) > 1 for training in result['training'] for held in result['heldOut'])
    with pytest.raises(ValueError):
        separated_views(frames[:9])
    assert quaternion_matrix([1, 0, 0, 0]) == [[1, 0, 0], [0, 1, 0], [0, 0, 1]]


def test_extreme_recovered_calibration_is_actionable_and_still_rejected(tmp_path):
    manifest = fixture(tmp_path)
    (tmp_path / 'sparse/cameras.txt').write_text('1 PINHOLE 32 24 20485614 20487219 16 12\n')
    with pytest.raises(UnusableCalibrationError, match=manifest['frames'][0]['name']):
        load_training_dataset(tmp_path)


def test_investigation_and_integer_resource_bounds_do_not_enable_cpu_training(tmp_path):
    profile = bounded_profile()
    assert profile['densification'] is False and profile['maxOomFallbacks'] == 1
    with pytest.raises(ValueError, match='NOT_ADMITTED'):
        train(tmp_path, tmp_path / 'output', profile)
    for name, value in [('iterations', True), ('max_seconds', 0), ('splat_cap', 100001), ('max_edge', 4096), ('checkpoint_interval', 1000)]:
        with pytest.raises(ValueError):
            bounded_profile(**{name: value})


def test_still_photo_holdout_does_not_invent_timestamps_or_merge_camera_groups():
    frames = [{'cameraGroupId': str(i), 'timestampSeconds': '0', 'captureKind': 'photo',
               'sha256': f'{i:064x}'} for i in range(16)]
    result = separated_views(frames)
    assert result['heldOut'] == [4, 12]
    assert not set(result['training']) & set(result['heldOut'])
    assert sorted(result['training'] + result['heldOut']) == list(range(16))
    assert result['excludedNeighbours'] == []
    assert result['geometricIndependenceConfirmed'] is False
    assert result['method'] == 'mixed_video_blocks_still_photo_hash_holdout_v1'
    frames[1]['sha256'] = frames[0]['sha256']
    with pytest.raises(ValueError, match='Distinct still photographs'):
        separated_views(frames)
