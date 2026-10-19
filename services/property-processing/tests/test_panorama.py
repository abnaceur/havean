from io import BytesIO
import hashlib
from PIL import Image
import pytest
from property_processing.source_sandbox import inspect_source
from property_processing.sources import SourceError


def fixture(path, size=(2048, 1024), orientation=1):
    image = Image.new('RGB', size, (50, 100, 150))
    exif = Image.Exif()
    exif[274] = orientation
    exif[270] = 'synthetic private document text'
    image.save(path, 'PNG', exif=exif)


@pytest.mark.parametrize('width', [2048, 4096])
def test_actual_ordinary_two_to_one_photo_is_never_certified_and_private_tiers_are_clean(tmp_path, width):
    fixture(tmp_path/'source.png', (width, width//2))
    result = inspect_source(tmp_path, 'source.png', 'panorama')
    assert result['genuinePanoramaConfirmed'] is False
    assert result['reviewRequired'] is True
    assert result['projectionBasis'] == 'dimensions_only'
    assert result['locationMetadataRetained'] is False
    assert [tier['width'] for tier in result['tiers']] == [size for size in (1024, 2048, 4096) if size <= width]
    for tier in result['tiers']:
        body = (tmp_path/tier['filename']).read_bytes()
        assert hashlib.sha256(body).hexdigest() == tier['sha256']
        assert len(body) == tier['byteSize']
        with Image.open(BytesIO(body)) as image:
            assert image.size == (tier['width'], tier['width']//2)
            assert image.info == {}
            assert image.getpixel((10, 10)) == (50, 100, 150)
    assert 'synthetic private' not in str(result)
    # Deterministic replay reuses only byte-identical private previews.
    assert inspect_source(tmp_path, 'source.png', 'panorama') == result


@pytest.mark.parametrize('size,orientation,code', [
    ((1024, 768), 1, 'PANORAMA_PROJECTION_REVIEW_REQUIRED'),
    ((512, 256), 1, 'PANORAMA_PROJECTION_REVIEW_REQUIRED'),
    ((1024, 512), 6, 'PANORAMA_ORIENTATION_REVIEW_REQUIRED'),
    ((1024, 512), 2, 'PANORAMA_ORIENTATION_REVIEW_REQUIRED'),
])
def test_projection_size_and_orientation_fail_closed_without_tiers(tmp_path, size, orientation, code):
    fixture(tmp_path/'source.png', size, orientation)
    with pytest.raises(SourceError, match=code):
        inspect_source(tmp_path, 'source.png', 'panorama')
    assert list(tmp_path.glob('panorama-*.png')) == []
