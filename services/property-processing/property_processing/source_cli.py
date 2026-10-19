"""Allowlisted isolated source decoder; stdout is private typed execution output."""
import json
import hashlib
import os
from pathlib import Path
import resource
import stat
import sys


def save_preview(directory, body, filename):
    from .sources import SourceError
    if len(body) > 32 * 1024 * 1024:
        raise SourceError('DERIVED_BYTE_BUDGET_EXCEEDED')
    path = directory / filename
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, 'rb') as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode) or hashlib.sha256(handle.read(len(body)+1)).digest() != hashlib.sha256(body).digest():
                raise SourceError('PREVIEW_OBJECT_MISMATCH')
        return
    with os.fdopen(descriptor, 'wb') as handle:
        handle.write(body)


def main():
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
    resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    try:
        from .sources import SourceError, inspect_pdf, upright_image
        root, name, kind = sys.argv[1:]
        directory = Path(root).resolve(strict=True)
        source = directory / name
        if Path(name).name != name or source.resolve(strict=True).parent != directory:
            raise SourceError("SOURCE_PATH_INVALID")
        from .decoder_isolation import enter_decoder_sandbox
        isolation = enter_decoder_sandbox(directory)
        descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "rb") as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                raise SourceError("SOURCE_PATH_INVALID")
            content = handle.read(20 * 1024 * 1024 + 1)
        if kind == "pdf":
            result = {"pages": inspect_pdf(content), "ocrAvailable": False}
        elif kind in ("pdf_raster", "pdf_ocr_pages", "native_facts_en", "native_facts_fr", "native_facts_ar", "native_facts_v3_en", "native_facts_v3_fr", "native_facts_v3_ar"):
            from .pdf_raster import rasterize_pdf
            pages = []
            for page in rasterize_pdf(content):
                body = page.pop('body')
                filename = f"page-{page['page']:03d}-{page['sha256']}.png"
                save_preview(directory, body, filename)
                pages.append({**page, 'previewFilename': filename})
            result = {'pages': pages, 'ocrAvailable': False}
            if kind == 'pdf_ocr_pages':
                result['sourceSha256'] = hashlib.sha256(content).hexdigest()
            elif kind != 'pdf_raster':
                from .facts import generic_candidates
                modern = kind.startswith('native_facts_v3_')
                candidates = generic_candidates([line for page in pages for line in page['nativeLines']], kind[-2:], include_counts=modern, include_text=modern)
                for candidate in candidates:
                    for evidence in candidate['evidence']:
                        evidence['assetId'] = name
                result.update({'candidates': candidates, 'requiresOcrPages': [page['page'] for page in pages if page['requiresOcr']],
                               'extractionMethod': 'generic-native-glyphs-v3' if modern else 'generic-native-glyphs-v1', 'reviewRequired': True,
                               'countryProfile': None, 'sourceSha256': hashlib.sha256(content).hexdigest(),
                               'locale': kind[-2:]})
        elif kind == "panorama":
            from .panorama import panorama_tiers
            result = panorama_tiers(content)
            result['ocrAvailable'] = False
            for tier in result['tiers']:
                save_preview(directory, tier.pop('body'), tier['filename'])
        elif kind in ("image", "photo_frame", "image_ocr_page"):
            body, metadata = upright_image(content, max_output_pixels=4000000 if kind == 'image_ocr_page' else None,
                                           max_output_edge=1600 if kind == 'image_ocr_page' else 1600 if kind == 'photo_frame' else None)
            if kind == 'image_ocr_page' and metadata['width'] * metadata['height'] > 4000000:
                raise SourceError('SOURCE_OCR_PAGE_BUDGET_EXCEEDED')
            checksum = hashlib.sha256(body).hexdigest()
            filename = f"page-001-{checksum}.png"
            save_preview(directory, body, filename)
            result = {"image": {**metadata, 'sha256': checksum, 'previewFilename': filename}, "ocrAvailable": False}
            if kind == 'image_ocr_page':
                result = {'sourceSha256': hashlib.sha256(content).hexdigest(),
                          'detectedMime': metadata['detectedMime'],
                          'pages': [{**result['image'], 'page': 1, 'nativeLines': [], 'requiresOcr': True}]}
        else:
            raise SourceError("SOURCE_KIND_INVALID")
        result["isolation"] = isolation
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
    except Exception as error:
        # Parser exceptions must never become paths, document text or raw stacks.
        from .sources import SourceError
        print(json.dumps({"ok": False, "code": str(error) if isinstance(error, SourceError) else "SOURCE_DECODER_FAILED"}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
