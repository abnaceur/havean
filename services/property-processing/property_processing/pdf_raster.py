"""Real bounded PDFium rasterization; callers must execute in source_sandbox.

Pages stay private. This creates upright pixels and transforms, never invented
OCR boxes or a measured floor plan. No forms, JavaScript or XFA are enabled.
"""
import hashlib
import importlib.util
from importlib.metadata import version as package_version
import json
import math
from functools import lru_cache
from contextlib import closing
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader
from .sources import inspect_pdf, SourceError, MAX_PIXELS, ORIENTATION_TRANSFORMS

MAX_DERIVED_BYTES = 32 * 1024 * 1024


@lru_cache(maxsize=1)
def verified_pdfium():
    try:
        manifest = json.loads((Path(__file__).resolve().parent.parent / 'dependencies.json').read_text())
        expected = manifest['python']['pypdfium2']['bundledNative']
        spec = importlib.util.find_spec('pypdfium2_raw')
        root = Path(next(iter(spec.submodule_search_locations)))
        version = json.loads((root / 'version.json').read_text())
        actual = '.'.join(str(version[key]) for key in ('major', 'minor', 'build', 'patch'))
        if (package_version('pypdfium2') != manifest['python']['pypdfium2']['version'] or actual != expected['version'] or version['flags'] != [] or expected['flags'] != [] or
                expected['binaryWheelPath'] != 'pypdfium2_raw/libpdfium.so'):
            raise SourceError('PDFIUM_BUILD_UNAPPROVED')
        digest = hashlib.sha256()
        with (root / 'libpdfium.so').open('rb') as handle:
            for chunk in iter(lambda: handle.read(65536), b''):
                digest.update(chunk)
        if digest.hexdigest() != expected['binarySha256']:
            raise SourceError('PDFIUM_BUILD_UNAPPROVED')
        import pypdfium2
        return pypdfium2
    except SourceError:
        raise
    except Exception as exc:
        raise SourceError('PDFIUM_BUILD_UNAVAILABLE') from exc


def page_transform(page):
    media, crop = page.mediabox, page.cropbox
    width, height = float(media.width), float(media.height)
    left, bottom = max(float(media.left), float(crop.left)), max(float(media.bottom), float(crop.bottom))
    right, top = min(float(media.right), float(crop.right)), min(float(media.top), float(crop.top))
    if right <= left or top <= bottom:
        raise SourceError('INVALID_PAGE_CROP')
    rotation = page.rotation % 360
    if rotation not in (0, 90, 180, 270):
        raise SourceError('INVALID_PAGE_ROTATION')
    if float(page.get('/UserUnit', 1)) != 1:
        raise SourceError('UNSUPPORTED_PAGE_UNIT')
    # Media-box-normalized top-left -> cropped normalized top-left -> upright.
    crop_matrix = [width/(right-left), 0, (float(media.left)-left)/(right-left),
                   0, height/(top-bottom), (top-float(media.top))/(top-bottom), 0, 0, 1]
    orientation = ORIENTATION_TRANSFORMS[{0: 1, 90: 6, 180: 3, 270: 8}[rotation]]
    matrix = [sum(orientation[row*3+k] * crop_matrix[k*3+col] for k in range(3))
              for row in range(3) for col in range(3)]
    return matrix


def native_lines(pdfium, page, original, transform, page_number):
    """Evidence boxes come from actual PDFium glyph bounds, never a whole-page guess."""
    lines, characters, boxes, invalid = [], [], [], False
    media = original.mediabox
    width, height = float(media.width), float(media.height)
    with closing(page.get_textpage()) as text_page:
        count = text_page.count_chars()
        if count > 100000:
            raise SourceError('NATIVE_TEXT_BUDGET_EXCEEDED')
        def flush():
            nonlocal characters, boxes, invalid
            text = ''.join(characters).strip()
            if text and boxes and not invalid and len(text) <= 2000:
                bbox = [min(box[0] for box in boxes), min(box[1] for box in boxes),
                        max(box[2] for box in boxes), max(box[3] for box in boxes)]
                if bbox[0] < bbox[2] and bbox[1] < bbox[3]:
                    lines.append({'page': page_number, 'text': text, 'bbox': bbox,
                                  'coordinateSpace': 'upright-page-normalized-top-left',
                                  'sourceKind': 'native_text_layer', 'scoreMethod': 'pdfium-glyph-bounds-v1'})
            characters, boxes, invalid = [], [], False
        for index in range(count):
            code = pdfium.raw.FPDFText_GetUnicode(text_page, index)
            if not code or code > 0x10ffff or 0xd800 <= code <= 0xdfff:
                invalid = True
                continue
            character = chr(code)
            if character in '\r\n':
                flush()
                continue
            characters.append(character)
            if len(characters) > 2000:
                invalid = True
            if character.isspace():
                continue
            left, bottom, right, top = text_page.get_charbox(index)
            original_points = [((x-float(media.left))/width, (float(media.top)-y)/height)
                               for x, y in ((left, top), (right, top), (left, bottom), (right, bottom))]
            points = [(transform[0]*x+transform[1]*y+transform[2],
                       transform[3]*x+transform[4]*y+transform[5]) for x, y in original_points]
            box = [min(p[0] for p in points), min(p[1] for p in points),
                   max(p[0] for p in points), max(p[1] for p in points)]
            # Partly cropped/hidden/degenerate glyphs cannot establish a visible source span.
            if not all(math.isfinite(value) and 0 <= value <= 1 for value in box) or box[0] >= box[2] or box[1] >= box[3]:
                invalid = True
            else:
                boxes.append(box)
        flush()
    return lines, count


def rasterize_pdf(content: bytes):
    native = inspect_pdf(content)
    reader = PdfReader(BytesIO(content), strict=True)
    transforms = [page_transform(page) for page in reader.pages]
    pdfium, pixels, output_bytes, native_characters = verified_pdfium(), 0, 0, 0
    try:
        with pdfium.PdfDocument(content) as document:
            if len(document) != len(native):
                raise SourceError('PAGE_COUNT_MISMATCH')
            for index, source in enumerate(native):
                with closing(document[index]) as page:
                    width, height = page.get_size()
                    expected_width, expected_height = math.ceil(width*150/72), math.ceil(height*150/72)
                    pixels += expected_width*expected_height
                    if expected_width < 1 or expected_height < 1 or pixels > MAX_PIXELS:
                        raise SourceError('RASTER_BUDGET_EXCEEDED')
                    lines, count = native_lines(pdfium, page, reader.pages[index], transforms[index], index+1)
                    native_characters += count
                    if native_characters > 100000:
                        raise SourceError('NATIVE_TEXT_BUDGET_EXCEEDED')
                    with closing(page.render(scale=150/72, may_draw_forms=False, rev_byteorder=True)) as bitmap:
                        image = bitmap.to_pil().convert('RGB')
                        encoded = BytesIO()
                        image.save(encoded, format='PNG')
                        body = encoded.getvalue()
                        output_bytes += len(body)
                        if output_bytes > MAX_DERIVED_BYTES:
                            raise SourceError('DERIVED_BYTE_BUDGET_EXCEEDED')
                        yield {'page': index+1, 'width': image.width, 'height': image.height,
                               'mime': 'image/png', 'sha256': hashlib.sha256(body).hexdigest(),
                               'coordinateSpace': 'upright-page-normalized-top-left',
                               'originalCoordinateSpace': 'mediabox-normalized-top-left',
                               'originalToUpright': transforms[index], 'sourceRotation': source['rotation'],
                               'nativeText': source['text'], 'nativeLines': lines,
                               'requiresOcr': source['requiresOcr'] or not bool(lines),
                               'processingProfile': 'pdfium-150dpi-v1',
                               'softwareVersions': {'pypdfium2': package_version('pypdfium2'),
                                                    'pypdf': package_version('pypdf'), 'pdfium': '156.0.8076.0'},
                               'body': body}
    except SourceError:
        raise
    except MemoryError as exc:
        raise SourceError('RASTER_MEMORY_BUDGET_EXCEEDED') from exc
    except Exception as exc:
        raise SourceError('PDF_RASTER_FAILED') from exc
