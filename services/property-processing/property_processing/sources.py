"""Bounded real source inspection. Raster OCR remains an explicit later stage."""
from io import BytesIO
import warnings
from pypdf import PdfReader
from PIL import Image, ImageOps

MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 50
MAX_PIXELS = 30_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class SourceError(ValueError):
    """Sanitized actionable input failure, without private source text or paths."""


def inspect_pdf(content: bytes, dpi: int = 150) -> list[dict]:
    if not content.startswith(b"%PDF-") or len(content) > MAX_BYTES:
        raise SourceError("INVALID_DOCUMENT")
    if dpi != 150:
        raise SourceError("UNSUPPORTED_RASTER_PROFILE")
    try:
        reader = PdfReader(BytesIO(content), strict=True)
        if reader.is_encrypted:
            raise SourceError("ENCRYPTED_DOCUMENT")
        if len(reader.pages) > MAX_PAGES:
            raise SourceError("PAGE_BUDGET_EXCEEDED")
        pages, pixels = [], 0
        for number, page in enumerate(reader.pages, 1):
            width, height = float(page.mediabox.width), float(page.mediabox.height)
            if width <= 0 or height <= 0 or width > 14400 or height > 14400:
                raise SourceError("INVALID_PAGE_BOUNDS")
            pixels += int(width * dpi / 72 + 0.999) * int(height * dpi / 72 + 0.999)
            if pixels > MAX_PIXELS:
                raise SourceError("RASTER_BUDGET_EXCEEDED")
            text = page.extract_text() or ""
            # Native text has page provenance, not invented token rectangles.
            pages.append({"page": number, "text": text, "sourceKind": "native_text",
                          "rotation": page.rotation % 360, "widthPoints": width,
                          "heightPoints": height, "requiresOcr": not bool(text.strip())})
        return pages
    except SourceError:
        raise
    except Exception as exc:
        raise SourceError("UNREADABLE_DOCUMENT") from exc


ORIENTATION_TRANSFORMS = {
    1: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    2: [-1, 0, 1, 0, 1, 0, 0, 0, 1],
    3: [-1, 0, 1, 0, -1, 1, 0, 0, 1],
    4: [1, 0, 0, 0, -1, 1, 0, 0, 1],
    5: [0, 1, 0, 1, 0, 0, 0, 0, 1],
    6: [0, -1, 1, 1, 0, 0, 0, 0, 1],
    7: [0, -1, 1, -1, 0, 1, 0, 0, 1],
    8: [0, 1, 0, -1, 0, 1, 0, 0, 1],
}


def upright_image(content: bytes) -> tuple[bytes, dict]:
    if len(content) > 10 * 1024 * 1024:
        raise SourceError("IMAGE_BYTE_BUDGET_EXCEEDED")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.format not in ("PNG", "JPEG"):
                    raise SourceError("UNSUPPORTED_IMAGE")
                if source.width * source.height > MAX_PIXELS or getattr(source, "n_frames", 1) != 1:
                    raise SourceError("RASTER_BUDGET_EXCEEDED")
                detected_mime = "image/png" if source.format == "PNG" else "image/jpeg"
                orientation = source.getexif().get(274, 1)
                if orientation not in ORIENTATION_TRANSFORMS:
                    raise SourceError("INVALID_ORIENTATION")
                image = ImageOps.exif_transpose(source).convert("RGB")
                # Do not carry identity/GPS/EXIF to the upright derived preview.
                image.info.clear()
                output = BytesIO()
                image.save(output, format="PNG")
                return output.getvalue(), {"detectedMime": detected_mime, "width": image.width, "height": image.height,
                                          "sourceOrientation": orientation,
                                          "coordinateSpace": "upright-page-normalized-top-left",
                                          "originalToUpright": ORIENTATION_TRANSFORMS[orientation].copy()}
    except SourceError:
        raise
    except Exception as exc:
        raise SourceError("UNREADABLE_IMAGE") from exc
