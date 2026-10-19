"""Build-only acquisition of exact offline OCR inputs; no package resolution."""
import hashlib
import io
import json
from pathlib import Path
import shutil
import tarfile
from urllib.request import urlopen

from audit_ocr_runtime import deb_data_archive

root = Path('/inputs')
pins = json.loads((root/'ocr-investigation-build.json').read_text())
release = json.loads((root/'ocr-production-release.json').read_text())
linkage = json.loads(Path('/native-linkage.json').read_text())
wheels = root/'.ocr-wheels'
sources = root/'.ocr-sources'
wheels.mkdir(exist_ok=True)


def verify(path, digest):
    if path.is_symlink() or not path.is_file():
        raise ValueError('Regular pinned input required')
    with path.open('rb') as handle:
        if hashlib.file_digest(handle, 'sha256').hexdigest() != digest:
            raise ValueError('Input checksum mismatch: '+str(path))


def fetch(url, target, digest, maximum):
    if not url.startswith('https://') or not 0 < maximum <= 512*1024**2:
        raise ValueError('Bounded HTTPS input required')
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = target.with_suffix(target.suffix+'.partial')
        try:
            with urlopen(url, timeout=60) as response, temporary.open('xb') as output:
                size = 0
                while body := response.read(65536):
                    size += len(body)
                    if size > maximum:
                        raise ValueError('Input download budget exceeded')
                    output.write(body)
            verify(temporary, digest)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    verify(target, digest)


for record in pins['packages'].values():
    for artifact in record['artifacts']:
        name = artifact['filename']
        if Path(name).name != name:
            raise ValueError('Canonical wheel name required')
        fetch(artifact['url'], wheels/name, artifact['sha256'], int(artifact['byteSize']))
for record in pins['debianPackages'].values():
    fetch('https://deb.debian.org/debian/'+record['filename'], wheels/record['file'], record['sha256'], 32*1024**2)
for model, record in pins['models'].items():
    for name, artifact in record['artifacts'].items():
        fetch(artifact['url'], wheels/'models'/model/name, artifact['sha256'], int(artifact['bytes']))

native = wheels/'models/native'
native.mkdir(parents=True, exist_ok=True)
for record in linkage['nativeReplacementMatches']:
    archive = sources/record['artifact']['cacheFile']
    verify(archive, record['artifact']['sha256'])
    with tarfile.open(fileobj=io.BytesIO(deb_data_archive(archive.read_bytes()))) as contents:
        member = contents.getmember(record['archiveMember'])
        if not member.isfile() or member.size > 128*1024**2:
            raise ValueError('Regular bounded native archive member required')
        target = native/record['file']
        if target.is_symlink():
            raise ValueError('Regular native target required')
        target.write_bytes(contents.extractfile(member).read())
    verify(target, record['sha256'])
intel = next(item for item in release['sourceArtifacts'] if item['id'] == 'intel-mklml-original')
archive = sources/intel['cacheFile']
verify(archive, intel['sha256'])
with tarfile.open(archive) as contents:
    for name in ('libiomp5.so', 'libmklml_intel.so'):
        members = [item for item in contents if item.isfile() and item.name.endswith('/lib/'+name)]
        if len(members) != 1 or members[0].size > 256*1024**2:
            raise ValueError('Exact original Intel member required')
        target = native/name
        if target.is_symlink():
            raise ValueError('Regular native target required')
        target.write_bytes(contents.extractfile(members[0]).read())
        verify(target, pins['nativeLibraries'][name]['sha256'])
for name, source in [('pins.json', 'ocr-models.json'), ('native/pins.json', 'ocr-native.json')]:
    file = root/'locks'/source
    expected = next(item['sha256'] for item in release['runtimeFiles'] if item['path'] == '/opt/ocr-models/'+name)
    verify(file, expected)
    target = wheels/'models'/name
    if target.is_symlink():
        raise ValueError('Regular model-pin target required')
    shutil.copyfile(file, target)
print('Verified 63 wheels, two Debian runtime packages, four model revisions and 15 native inputs; no runtime downloads.')
