"""Private panorama candidates; image proportions never establish capture truth."""
from io import BytesIO
import hashlib
import warnings
from PIL import Image, ImageOps
from .sources import MAX_PIXELS, SourceError


def panorama_tiers(content: bytes):
    if not 0 < len(content) <= 20*1024*1024:
        raise SourceError('PANORAMA_BYTE_BUDGET_EXCEEDED')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.format not in ('JPEG', 'PNG') or getattr(source, 'n_frames', 1) != 1:
                    raise SourceError('PANORAMA_FORMAT_INVALID')
                if source.width*source.height > MAX_PIXELS:
                    raise SourceError('PANORAMA_PIXEL_BUDGET_EXCEEDED')
                orientation = source.getexif().get(274, 1)
                if orientation not in (1, 3):
                    # Quarter-turns/reflections change the spherical projection.
                    raise SourceError('PANORAMA_ORIENTATION_REVIEW_REQUIRED')
                image = ImageOps.exif_transpose(source).convert('RGB')
                if image.width < 1024 or image.width != 2*image.height:
                    raise SourceError('PANORAMA_PROJECTION_REVIEW_REQUIRED')
                image.info.clear()
                tiers, aggregate = [], 0
                for width in (1024, 2048, 4096):
                    if width > image.width:
                        continue
                    output = BytesIO()
                    image.resize((width, width//2), Image.Resampling.LANCZOS).save(output, 'PNG')
                    body = output.getvalue()
                    aggregate += len(body)
                    if aggregate > 32*1024*1024:
                        raise SourceError('PANORAMA_DERIVED_BUDGET_EXCEEDED')
                    checksum = hashlib.sha256(body).hexdigest()
                    tiers.append({'width': width, 'height': width//2, 'sha256': checksum,
                                  'byteSize': len(body), 'filename': f'panorama-{width}-{checksum}.png', 'body': body})
                return {'projection': 'equirectangular_candidate', 'projectionBasis': 'dimensions_only',
                        'genuinePanoramaConfirmed': False, 'reviewRequired': True,
                        'reviewReason': 'Capture provenance and spherical projection require review; a 2:1 photo is insufficient.',
                        'sourceWidth': image.width, 'sourceHeight': image.height,
                        'sourceOrientation': orientation, 'locationMetadataRetained': False,
                        'processingProfile': 'private-panorama-candidate-v1', 'tiers': tiers}
    except SourceError:
        raise
    except Exception as error:
        raise SourceError('PANORAMA_DECODE_INVALID') from error
