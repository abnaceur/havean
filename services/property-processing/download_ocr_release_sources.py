"""Build-time acquisition of only the checksum-pinned distribution source bundle."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--manifest', required=True)
parser.add_argument('--directory', required=True)
args = parser.parse_args()
release = json.loads(Path(args.manifest).read_text())
root = Path(args.directory)
root.mkdir(parents=True, exist_ok=True)
for artifact in release['sourceArtifacts']:
    name = artifact['cacheFile']
    if Path(name).name != name or not artifact['url'].startswith('https://'):
        raise ValueError('Canonical HTTPS source artifact required')
    target = root / name
    if target.is_symlink():
        raise ValueError('Regular source cache required')
    if not target.exists():
        temporary = target.with_suffix(target.suffix + '.partial')
        try:
            with urlopen(artifact['url'], timeout=60) as response, temporary.open('xb') as output:
                count = 0
                while body := response.read(65536):
                    count += len(body)
                    if count > int(artifact['byteSize']):
                        raise ValueError('Source archive byte budget exceeded')
                    output.write(body)
            with temporary.open('rb') as handle:
                if count != int(artifact['byteSize']) or hashlib.file_digest(handle, 'sha256').hexdigest() != artifact['sha256']:
                    raise ValueError('Source archive checksum mismatch')
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    with target.open('rb') as handle:
        if target.stat().st_size != int(artifact['byteSize']) or hashlib.file_digest(handle, 'sha256').hexdigest() != artifact['sha256']:
            raise ValueError('Source cache checksum mismatch')
    print(artifact['id'] + ': verified')
