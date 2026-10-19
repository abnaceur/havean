"""Conservative proposals from verified raw OCR; never a form approval.

The source hash and locale are supplied by the scoped execution, not inferred
from text. Native OCR confidence remains attached to tokens and is never used
as calibrated fact accuracy. Missing fields have no candidate.
"""
import math
import re
from .facts import generic_candidates
from .sources import SourceError


def propose_ocr_facts(result, source_sha256, locale, *, page=1, include_text=False):
    if (locale not in ('en', 'fr', 'ar') or not isinstance(source_sha256, str) or
            not re.fullmatch(r'[a-f0-9]{64}', source_sha256) or not isinstance(result, dict) or
            not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= 50):
        raise SourceError('OCR_FACT_SOURCE_INVALID')
    if (result.get('schemaVersion') != 1 or isinstance(result.get('schemaVersion'), bool) or
            result.get('sourceSha256') != source_sha256 or result.get('locale') != locale or
            result.get('page') != page or
            result.get('coordinateSpace') != 'upright-page-normalized-top-left' or
            result.get('reviewRequired') is not True or
            result.get('scoreMethod') != 'native_model_score_uncalibrated'):
        raise SourceError('OCR_FACT_SOURCE_INVALID')
    page, width, height = (result.get(key) for key in ('page', 'width', 'height'))
    if (any(not isinstance(value, int) or isinstance(value, bool) for value in (page, width, height)) or
            not 1 <= page <= 50 or width <= 0 or height <= 0 or width * height > 4 * 1024**2):
        raise SourceError('OCR_FACT_SOURCE_INVALID')
    tokens = result.get('tokens')
    if not isinstance(tokens, list) or len(tokens) > 5000:
        raise SourceError('OCR_FACT_TOKENS_INVALID')
    lines = []
    for token in tokens:
        if not isinstance(token, dict) or set(token) != {'text', 'score', 'polygon'}:
            raise SourceError('OCR_FACT_TOKENS_INVALID')
        text, score, polygon = (token[key] for key in ('text', 'score', 'polygon'))
        if (not isinstance(text, str) or not text or len(text) > 2000 or
                isinstance(score, bool) or not isinstance(score, (float, int)) or
                not math.isfinite(score) or not 0 <= score <= 1 or
                not isinstance(polygon, list) or len(polygon) != 4):
            raise SourceError('OCR_FACT_TOKENS_INVALID')
        for point in polygon:
            if (not isinstance(point, list) or len(point) != 2 or
                    any(isinstance(value, bool) or not isinstance(value, (float, int)) or
                        not math.isfinite(value) or not 0 <= value <= 1 for value in point)):
                raise SourceError('OCR_FACT_TOKENS_INVALID')
        bbox = [min(point[0] for point in polygon), min(point[1] for point in polygon),
                max(point[0] for point in polygon), max(point[1] for point in polygon)]
        if bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
            raise SourceError('OCR_FACT_TOKENS_INVALID')
        lines.append({'text': text, 'page': page, 'bbox': bbox})
    return {'schemaVersion': 1, 'sourceSha256': source_sha256, 'locale': locale,
            'page': page, 'reviewRequired': True,
            'candidates': generic_candidates(lines, locale, include_counts=True, include_text=include_text)}
