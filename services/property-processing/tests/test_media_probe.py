import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import pytest
from PIL import Image
from property_processing.media_probe import normalize_probe, probe_media
from property_processing.sources import SourceError

FIXTURES = json.loads((Path(__file__).parent/'fixtures/media-synthetic.json').read_text())


def source(directory, name):
    entry = FIXTURES['files'][name]
    body = base64.b64decode(entry['base64'])
    assert hashlib.sha256(body).hexdigest() == entry['sha256']
    (directory/name).write_bytes(body)
    return directory/name


def metadata():
    return {'streams': [{'codec_type': 'video', 'codec_name': 'h264', 'width': 320, 'height': 240}],
            'format': {'format_name': 'mov,mp4,m4a,3gp,3g2,mj2', 'duration': '1.000000',
                       'tags': {'location': 'synthetic private GPS tag'}}}


def test_profile_does_not_retain_private_tags_and_refuses_unknown_codec_orientation_and_budget():
    assert normalize_probe(metadata())['locationMetadataRetained'] is False
    assert 'tags' not in normalize_probe(metadata())
    for key, value, code in [('codec_name', 'mpeg4', 'MEDIA_CODEC_UNSUPPORTED'),
                             ('width', 8192, 'MEDIA_DIMENSION_BUDGET_EXCEEDED'),
                             ('tags', {'rotate': '45'}, 'MEDIA_ORIENTATION_CONFLICT'),
                             ('tags', {'rotate': 'nan'}, 'MEDIA_ORIENTATION_CONFLICT'),
                             ('sample_aspect_ratio', '2:1', 'MEDIA_PIXEL_ASPECT_UNSUPPORTED')]:
        invalid = metadata()
        invalid['streams'][0][key] = value
        with pytest.raises(SourceError, match=code):
            normalize_probe(invalid)
    invalid = metadata()
    invalid['format']['duration'] = '601'
    with pytest.raises(SourceError, match='MEDIA_DURATION_BUDGET_EXCEEDED'):
        normalize_probe(invalid)


def test_actual_confined_rotated_h264_produces_upright_pixels_and_sanitized_thumbnail(tmp_path):
    source(tmp_path, 'rotated.mp4')
    result = probe_media(tmp_path, 'rotated.mp4')
    assert result['codec'] == 'h264'
    assert result['encodedWidth'] == 320 and result['encodedHeight'] == 240
    assert result['uprightWidth'] == 240 and result['uprightHeight'] == 320
    assert result['displayRotationDegrees'] == 90
    assert result['reviewRequired'] is True
    with Image.open(tmp_path/result['thumbnail']['filename']) as image:
        assert image.size == (480, 640)
        assert image.info == {}
        # FFmpeg's display-matrix rotation=90 is counterclockwise: green, yellow, red, blue.
        expected = [(0, 255, 0), (255, 255, 0), (255, 0, 0), (0, 0, 255)]
        for point, rgb in zip([(120, 160), (360, 160), (120, 480), (360, 480)], expected):
            actual = image.convert('RGB').getpixel(point)
            assert max(abs(a-b) for a, b in zip(actual, rgb)) < 12
    assert hashlib.sha256((tmp_path/result['thumbnail']['filename']).read_bytes()).hexdigest() == result['thumbnail']['sha256']


def test_actual_unsupported_codec_is_clear_and_produces_no_thumbnail(tmp_path):
    source(tmp_path, 'unsupported.mp4')
    with pytest.raises(SourceError, match='MEDIA_CODEC_UNSUPPORTED'):
        probe_media(tmp_path, 'unsupported.mp4')
    assert not (tmp_path/'thumbnail.png').exists()


def test_media_sandbox_still_denies_network_fork_external_file_and_shell_exec(tmp_path):
    script = """
import os,socket
from pathlib import Path
from property_processing.decoder_isolation import enter_decoder_sandbox
enter_decoder_sandbox(Path(__import__('sys').argv[1]),media_executable='/opt/media/bin/ffprobe')
for operation in (lambda:socket.socket(),lambda:os.fork(),lambda:Path('/etc/passwd').read_bytes(),lambda:os.execve('/bin/sh',['/bin/sh','-c','exit 0'],{})):
 try:operation();raise RuntimeError('isolation escape')
 except PermissionError:pass
print('all media confinement denials passed')
"""
    result = subprocess.run([sys.executable, '-c', script, str(tmp_path)], capture_output=True, timeout=10)
    assert result.returncode == 0, result.stderr.decode()
    assert b'all media confinement denials passed' in result.stdout


def test_media_source_symlink_and_existing_output_are_rejected(tmp_path):
    source(tmp_path, 'source.mp4')
    (tmp_path/'alias.mp4').symlink_to(tmp_path/'source.mp4')
    with pytest.raises(SourceError, match='MEDIA_SOURCE_PATH_INVALID'):
        probe_media(tmp_path, 'alias.mp4')
    (tmp_path/'thumbnail.png').write_bytes(b'owned existing output')
    with pytest.raises(SourceError, match='MEDIA_OUTPUT_EXISTS'):
        probe_media(tmp_path, 'source.mp4')


@pytest.mark.parametrize('name,codec', [('source.mp4','h264'),('hevc.mov','hevc'),('vp8.webm','vp8'),('vp9.webm','vp9')])
def test_actual_supported_container_codecs_normalize_without_camera_metadata(tmp_path, name, codec):
    source(tmp_path, name)
    result = probe_media(tmp_path, name)
    assert result['codec'] == codec and result['displayRotationDegrees'] == 0
    assert result['thumbnail']['width'] == 640 and result['thumbnail']['height'] == 480
    with Image.open(tmp_path/result['thumbnail']['filename']) as image:
        assert image.info == {} and image.size == (640,480)
