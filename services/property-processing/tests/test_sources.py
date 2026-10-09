from io import BytesIO
import pytest
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from PIL import Image
from property_processing.sources import SourceError, inspect_pdf, upright_image


def pdf(text=None, pages=1, width=200, height=200, encrypted=False):
    writer = PdfWriter()
    for _ in range(pages):
        page = writer.add_blank_page(width, height)
        if text is not None:
            font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                                     NameObject("/Subtype"): NameObject("/Type1"),
                                     NameObject("/BaseFont"): NameObject("/Helvetica")})
            page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
            stream = DecodedStreamObject()
            stream.set_data(f"BT /F1 12 Tf 20 150 Td ({text}) Tj ET".encode())
            page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("private")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def test_real_native_text_is_preserved_without_inventing_token_boxes():
    pages = inspect_pdf(pdf("Unit 00123 Area 184,20 m2"))
    assert "00123" in pages[0]["text"]
    assert "184,20" in pages[0]["text"]
    assert pages[0]["requiresOcr"] is False
    assert "bbox" not in pages[0]


def test_blank_scanned_page_explicitly_requires_ocr():
    pages = inspect_pdf(pdf())
    assert pages[0]["text"] == ""
    assert pages[0]["requiresOcr"] is True


@pytest.mark.parametrize("content,code", [(pdf(encrypted=True), "ENCRYPTED_DOCUMENT"),
                                           (pdf(pages=51), "PAGE_BUDGET_EXCEEDED"),
                                           (pdf(width=14400, height=14400), "RASTER_BUDGET_EXCEEDED"),
                                           (b"private owner text", "INVALID_DOCUMENT")])
def test_document_failures_are_bounded_and_sanitized(content, code):
    with pytest.raises(SourceError, match=code):
        inspect_pdf(content)


@pytest.mark.parametrize("orientation", range(1, 9))
def test_evidence_transform_matches_actual_upright_pixel_and_strips_metadata(orientation):
    source = Image.new("RGB", (4, 2), "white")
    source.putpixel((0, 0), (255, 0, 0))
    exif = source.getexif()
    exif[274] = orientation
    exif[315] = "Private identity sentinel"
    encoded = BytesIO()
    source.save(encoded, format="PNG", exif=exif)
    output, metadata = upright_image(encoded.getvalue())
    upright = Image.open(BytesIO(output))
    matrix = metadata["originalToUpright"]
    x, y = 0.5 / 4, 0.5 / 2
    px = int((matrix[0] * x + matrix[1] * y + matrix[2]) * upright.width)
    py = int((matrix[3] * x + matrix[4] * y + matrix[5]) * upright.height)
    assert upright.getpixel((px, py)) == (255, 0, 0)
    assert not upright.getexif()
    assert b"Private identity sentinel" not in output
