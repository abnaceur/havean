import json,hashlib
from pathlib import Path
root=Path('/wheels');pins=json.loads(Path('/tmp/ocr-investigation-build.json').read_text())
assert pins['enabled'] is False and pins['schemaVersion']==1
for record in pins['packages'].values():
 for artifact in record['artifacts']:
  assert Path(artifact['filename']).name==artifact['filename'] and artifact['filename'].endswith('.whl')
  assert not (root/artifact['filename']).is_symlink()
  assert hashlib.sha256((root/artifact['filename']).read_bytes()).hexdigest()==artifact['sha256']
for record in pins['debianPackages'].values():
 assert Path(record['file']).name==record['file'] and record['file'].endswith('.deb')
 assert not (root/record['file']).is_symlink()
 assert hashlib.sha256((root/record['file']).read_bytes()).hexdigest()==record['sha256']
