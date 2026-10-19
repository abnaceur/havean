import hashlib
import json
import math
from pathlib import Path
import struct

import pytest

from property_processing.splat_export import export_private_tiers


def ply(path, rows=None, rest=0, *, count=None, header_override=None):
    if rows is None:
        rows = [[0, 0, 0, 0, 0, 0] + [0] * rest + [0, math.log(.2), math.log(.3), math.log(.4), 1, 0, 0, 0],
                [1, 2, 3, 1, 0, -1] + [0] * rest + [math.log(3), 0, 0, 0, 0, 0, 0, 1]]
    names = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2'] + [f'f_rest_{i}' for i in range(rest)] + ['opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
    header = header_override or ('ply\nformat binary_little_endian 1.0\nelement vertex ' + str(len(rows) if count is None else count) + '\n' + ''.join('property float ' + name + '\n' for name in names) + 'end_header\n')
    path.write_bytes(header.encode() + b''.join(struct.pack('<' + 'f' * len(row), *row) for row in rows))
    return path


def test_actual_binary_export_preserves_position_scales_opacity_quaternion_and_private_full(tmp_path):
    source = ply(tmp_path / 'scene.ply', rest=45)
    output = tmp_path / 'package'
    result = export_private_tiers(source, output)
    assert (output / 'full.ply').read_bytes() == source.read_bytes()
    assert result == json.loads((output / 'manifest.json').read_text())
    assert result['source']['sphericalHarmonicDegree'] == 3
    assert result['source']['sha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
    first, second = struct.iter_unpack('<6f8B', (output / 'desktop.splat').read_bytes())
    assert first[:3] == (0, 0, 0)
    assert first[3:6] == pytest.approx((.2, .3, .4))
    assert first[6:] == (128, 128, 128, 128, 255, 128, 128, 128)
    assert second[:3] == (1, 2, 3)
    assert second[9] == 191
    assert second[10:] == (128, 128, 128, 255)
    assert result['bounds'] == {'min': [0, 0, 0], 'max': [1, 2, 3]}
    assert result['scale'] is None and result['unit'] == 'arbitrary'
    assert result['publiclyServed'] is False and result['viewerValidated'] is False
    assert all((output / tier['file']).stat().st_size == int(tier['byteSize']) for tier in result['tiers'])
    assert (output.stat().st_mode & 0o777) == 0o700
    assert all((path.stat().st_mode & 0o777) == 0o600 for path in output.iterdir())


def test_reduced_tier_is_measured_deterministic_and_declares_harmonic_loss(tmp_path):
    source = ply(tmp_path / 'scene.ply', rest=9)
    result = export_private_tiers(source, tmp_path / 'first', mobile_bytes=32, desktop_bytes=64)
    second = export_private_tiers(source, tmp_path / 'second', mobile_bytes=32, desktop_bytes=64)
    assert result == second
    assert [tier['splatCount'] for tier in result['tiers']] == [1, 2]
    assert result['tiers'][0]['sampling'] == 'deterministic_uniform'
    assert result['tiers'][1]['sampling'] == 'all'
    assert struct.unpack('<6f8B', (tmp_path / 'first/mobile.splat').read_bytes())[:3] == (1, 2, 3)
    assert result['tiers'][0]['sphericalHarmonicDegree'] == 0


@pytest.mark.parametrize('attribute,value', [(0, float('nan')), (3, float('inf')), (0, 1e7), (7, 20), (10, 0)])
def test_broken_attributes_rejected_without_partial_package(tmp_path, attribute, value):
    row = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    row[attribute] = value
    source = ply(tmp_path / 'scene.ply', [row, [1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]])
    with pytest.raises(ValueError):
        export_private_tiers(source, tmp_path / 'output')
    assert not (tmp_path / 'output').exists()
    assert not list(tmp_path.glob('.splat-export-*'))


@pytest.mark.parametrize('kind', ['empty', 'truncated', 'trailing', 'attributes', 'ascii', 'degenerate', 'invisible', 'symlink'])
def test_empty_malformed_or_unusable_inputs_rejected(tmp_path, kind):
    source = ply(tmp_path / 'scene.ply')
    if kind == 'empty':
        ply(source, [])
    elif kind == 'truncated':
        source.write_bytes(source.read_bytes()[:-1])
    elif kind == 'trailing':
        source.write_bytes(source.read_bytes() + b'x')
    elif kind == 'attributes':
        source.write_bytes(source.read_bytes().replace(b'f_dc_0', b'f_dc_9'))
    elif kind == 'ascii':
        source.write_bytes(source.read_bytes().replace(b'binary_little_endian', b'ascii'))
    elif kind in ('degenerate', 'invisible'):
        row = [0, 0, 0, 0, 0, 0, -80 if kind == 'invisible' else 0, 0, 0, 0, 1, 0, 0, 0]
        other = list(row)
        if kind == 'invisible':
            other[0] = 1
        ply(source, [row, other])
    else:
        link = tmp_path / 'link.ply'
        link.symlink_to(source)
        source = link
    with pytest.raises((ValueError, OSError)):
        export_private_tiers(source, tmp_path / 'output')
    assert not (tmp_path / 'output').exists()


def test_existing_output_and_unsafe_budgets_are_never_overwritten(tmp_path):
    source = ply(tmp_path / 'scene.ply')
    output = tmp_path / 'output'
    output.mkdir()
    (output / 'sentinel').write_text('keep')
    with pytest.raises(ValueError):
        export_private_tiers(source, output)
    assert (output / 'sentinel').read_text() == 'keep'
    for budget in (0, True, 32.5, 25 * 1024**2):
        with pytest.raises(ValueError):
            export_private_tiers(source, tmp_path / 'new', mobile_bytes=budget)
