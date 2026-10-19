"""Private bounded document OCR investigation with original page lineage.

Native glyphs take precedence. Only pages requiring OCR enter the separate
confined model process. One deadline includes rasterization and all pages.
Nothing here enables production OCR or approves a field.
"""
import re
import time
from pathlib import Path
from .facts import generic_candidates
from .ocr_facts import propose_ocr_facts
from .ocr_sandbox import inspect_ocr
from .source_sandbox import inspect_source
from .sources import SourceError


def inspect_document_ocr(directory, name, locale, source_sha256, *, timeout=15, cancelled=None, source_mime='application/pdf', production=False):
    if (locale not in ('en', 'fr', 'ar') or not isinstance(source_sha256, str) or
            not re.fullmatch(r'[a-f0-9]{64}', source_sha256) or
            source_mime not in ('application/pdf', 'image/jpeg', 'image/png') or
            isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 0 < timeout <= 15):
        raise SourceError('SOURCE_OCR_PROFILE_INVALID')
    try:
        root = Path(directory).resolve(strict=True)
        source = root / name
        if Path(name).name != name or source.is_symlink() or not source.is_file() or source.resolve(strict=True).parent != root:
            raise SourceError('SOURCE_PATH_INVALID')
    except (OSError, TypeError, ValueError):
        raise SourceError('SOURCE_PATH_INVALID') from None
    if production:
        from .ocr_release import production_ocr_ready
        if not production_ocr_ready():
            raise SourceError('SOURCE_OCR_PROFILE_INVALID')
    deadline = time.monotonic() + timeout

    def remaining():
        if cancelled is not None and cancelled():
            raise SourceError('SOURCE_CANCELLED')
        budget = deadline - time.monotonic()
        if budget <= 0:
            raise SourceError('SOURCE_TIME_BUDGET_EXCEEDED')
        return min(15, budget)

    raster = inspect_source(root, name, 'pdf_ocr_pages' if source_mime == 'application/pdf' else 'image_ocr_page', timeout=remaining(), cancelled=cancelled)
    if raster.get('sourceSha256') != source_sha256:
        raise SourceError('SOURCE_OBJECT_MISMATCH')
    if source_mime != 'application/pdf' and raster.get('detectedMime') != source_mime:
        raise SourceError('SOURCE_MIME_MISMATCH')
    pages = raster.get('pages')
    if not isinstance(pages, list) or not 1 <= len(pages) <= 50:
        raise SourceError('SOURCE_OCR_PAGE_INVALID')
    candidates, token_pages = [], []
    for index, page in enumerate(pages, 1):
        if (not isinstance(page, dict) or page.get('page') != index or
                isinstance(page.get('page'), bool) or not isinstance(page.get('sha256'), str) or
                not re.fullmatch(r'[a-f0-9]{64}', page['sha256']) or
                page.get('previewFilename') != f"page-{index:03d}-{page['sha256']}.png" or
                not isinstance(page.get('requiresOcr'), bool)):
            raise SourceError('SOURCE_OCR_PAGE_INVALID')
        remaining()
        if page['requiresOcr']:
            raw = inspect_ocr(root, page['previewFilename'], locale, page['sha256'], timeout=remaining(), cancelled=cancelled)
            if raw['width'] != page['width'] or raw['height'] != page['height']:
                raise SourceError('SOURCE_OCR_PAGE_INVALID')
            # The isolated image reader sees page1. Only the trusted raster
            # manifest binds it to this original document page number.
            bound = {**raw, 'page': index}
            proposals = propose_ocr_facts(bound, page['sha256'], locale, page=index, include_text=True)['candidates']
            token_pages.append({'page': index, 'sourceDocumentSha256': source_sha256,
                                'pageRasterSha256': page['sha256'], 'tokens': raw['tokens'],
                                'scoreMethod': raw['scoreMethod'], 'isolation': raw['isolation']})
        else:
            lines = page.get('nativeLines')
            if not isinstance(lines, list) or any(not isinstance(line, dict) or line.get('page') != index for line in lines):
                raise SourceError('SOURCE_OCR_PAGE_INVALID')
            proposals = generic_candidates(lines, locale, include_counts=True, include_text=True)
        for candidate in proposals:
            for evidence in candidate['evidence']:
                evidence['assetId'] = name
            candidates.append(candidate)
    remaining()  # A terminal receipt cannot accept late page output.
    return {'schemaVersion': 1, 'sourceSha256': source_sha256, 'locale': locale,
            'pages': pages, 'ocrPages': token_pages, 'candidates': candidates,
            'extractionMethod': 'generic-native-then-ocr-v1' if production else 'generic-native-then-ocr-investigation-v1',
            'reviewRequired': True, 'countryProfile': None, 'productionOcrEnabled': production,
            'isolation': raster['isolation']}
