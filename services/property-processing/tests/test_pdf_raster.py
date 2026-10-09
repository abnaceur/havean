from io import BytesIO
import hashlib
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject, RectangleObject, NumberObject
from PIL import Image
from property_processing.sources import SourceError
from property_processing.pdf_raster import rasterize_pdf
from property_processing.source_sandbox import inspect_source
from test_sources import pdf


def rectangle_pdf(rotation=90, cropped=False, user_unit=1):
    writer = PdfWriter()
    page = writer.add_blank_page(width=100, height=200)
    page.rotate(rotation)
    if cropped:
        page.cropbox = RectangleObject([10, 20, 90, 180])
    page[NameObject('/UserUnit')] = NumberObject(user_unit)
    stream = DecodedStreamObject()
    stream.set_data(b'0 0 0 rg 20 30 10 20 re f')
    page[NameObject('/Contents')] = writer._add_object(stream)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def transformed_point(matrix, x, y):
    return matrix[0]*x + matrix[1]*y + matrix[2], matrix[3]*x + matrix[4]*y + matrix[5]


@pytest.mark.parametrize('cropped', [False, True])
def test_rotated_scanned_page_transform_matches_actual_rendered_pixels(cropped):
    page = list(rasterize_pdf(rectangle_pdf(cropped=cropped)))[0]
    assert page['sourceRotation'] == 90
    assert page['softwareVersions']['pypdfium2'] == '5.14.0'
    assert page['processingProfile'] == 'pdfium-150dpi-v1'
    assert page['requiresOcr'] is True
    assert page['nativeText'] == ''
    image = Image.open(BytesIO(page['body']))
    x, y = transformed_point(page['originalToUpright'], .25, .8)
    assert image.getpixel((int(x*image.width), int(y*image.height))) == (0, 0, 0)
    assert image.getpixel((image.width-2, image.height-2)) == (255, 255, 255)
    assert page['sha256'] == hashlib.sha256(page['body']).hexdigest()
    assert 'bbox' not in page  # Rendering alone never invents OCR evidence.


def test_real_isolated_raster_stage_creates_immutable_private_preview_and_keeps_native_text(tmp_path):
    (tmp_path / 'source.pdf').write_bytes(pdf('Unit 00123'))
    result = inspect_source(tmp_path, 'source.pdf', 'pdf_raster')
    page = result['pages'][0]
    assert '00123' in page['nativeText']
    assert page['requiresOcr'] is False
    preview = tmp_path / page['previewFilename']
    assert hashlib.sha256(preview.read_bytes()).hexdigest() == page['sha256']
    assert result['ocrAvailable'] is False
    assert inspect_source(tmp_path, 'source.pdf', 'pdf_raster') == result
    preview.write_bytes(b'forged')
    with pytest.raises(SourceError, match='PREVIEW_OBJECT_MISMATCH'):
        inspect_source(tmp_path, 'source.pdf', 'pdf_raster')


def test_raster_stage_rejects_encryption_expansion_and_unprofiled_page_units():
    for content, code in [(pdf(encrypted=True), 'ENCRYPTED_DOCUMENT'),
                          (pdf(width=14400, height=14400), 'RASTER_BUDGET_EXCEEDED'),
                          (rectangle_pdf(user_unit=2), 'UNSUPPORTED_PAGE_UNIT')]:
        with pytest.raises(SourceError, match=code):
            list(rasterize_pdf(content))


@pytest.mark.parametrize('rotation', [0, 90, 180, 270])
def test_actual_native_glyph_bounds_align_with_upright_pixels_and_generic_candidates(rotation):
    from property_processing.facts import generic_candidates
    content = pdf('Unit number: 00123')
    reader = __import__('pypdf').PdfReader(BytesIO(content))
    page = reader.pages[0]
    page.rotate(rotation)
    writer = PdfWriter()
    writer.add_page(page)
    encoded = BytesIO()
    writer.write(encoded)
    raster = list(rasterize_pdf(encoded.getvalue()))[0]
    assert raster['requiresOcr'] is False
    line = raster['nativeLines'][0]
    assert line['text'] == 'Unit number: 00123'
    image = Image.open(BytesIO(raster['body']))
    # Every ink pixel must be covered by the real glyph bounds, allowing raster antialiasing.
    box = line['bbox']
    pixels = [(x, y) for y in range(image.height) for x in range(image.width)
              if sum(image.getpixel((x, y))) < 600]
    assert pixels
    assert min(x for x, _ in pixels) >= box[0]*image.width-2
    assert max(x for x, _ in pixels) <= box[2]*image.width+2
    assert min(y for _, y in pixels) >= box[1]*image.height-2
    assert max(y for _, y in pixels) <= box[3]*image.height+2
    candidates = generic_candidates([line], locale='en')
    assert candidates[0]['normalizedValue'] == '00123'
    assert candidates[0]['evidence'][0]['bbox'] == box


def test_cropped_out_native_text_does_not_supply_visible_evidence():
    from pypdf import PdfReader
    reader = PdfReader(BytesIO(pdf('Unit number: 00123')))
    page = reader.pages[0]
    page.cropbox.upper_right = (200, 100)  # Text baseline is 150 points and is outside preview.
    writer = PdfWriter()
    writer.add_page(page)
    encoded = BytesIO()
    writer.write(encoded)
    raster = list(rasterize_pdf(encoded.getvalue()))[0]
    assert raster['nativeLines'] == []
    assert raster['requiresOcr'] is True
