"""Verify the distributable bundle at image build time; never download at runtime."""
import hashlib
import json
import os
from pathlib import Path

from property_processing.ocr_release import _verified_file, production_ocr_ready

path = Path('/opt/processing/ocr-release.json')
release = json.loads(path.read_text())
for item in release['sourceArtifacts']:
    if Path(item['cacheFile']).name != item['cacheFile']:
        raise ValueError('Canonical source archive filename required')
    _verified_file(Path('/usr/share/doc/haven-processing/ocr-sources') / item['cacheFile'], item['sha256'], 256*1024**2)
for item in release['notices']:
    name = item['path'].removeprefix('docs/adr/licenses/')
    if name.startswith('/') or '..' in Path(name).parts:
        raise ValueError('Canonical notice path required')
    _verified_file(Path('/usr/share/doc/haven-processing/source-notices') / name, item['sha256'], 4*1024**2)
os.environ['PROCESSING_ENABLE_OCR'] = 'true'
os.environ['PROCESSING_OCR_RELEASE_SHA256'] = hashlib.sha256(path.read_bytes()).hexdigest()
assert production_ocr_ready()
print(json.dumps({'status': 'verified', 'releaseSha256': os.environ['PROCESSING_OCR_RELEASE_SHA256'],
                  'runtimeFiles': len(release['runtimeFiles']), 'sourceArchives': len(release['sourceArtifacts']),
                  'notices': len(release['notices']), 'runtimeDownloads': False}))
