"""Install exact, SHA256 checked Debian dependencies from signed package indexes."""
import hashlib
import json
from pathlib import Path
import subprocess

profile = json.loads(Path('/tmp/colmap-apt.json').read_text())
packages = profile['packages']
versions = [name + '=' + entry['version'] for name, entry in packages.items()]
subprocess.run(['apt-get', 'update'], check=True)
subprocess.run(['apt-get', 'install', '-y', '--download-only', '--no-install-recommends', *versions], check=True)
for archive in Path('/var/cache/apt/archives').glob('*.deb'):
    fields = subprocess.check_output(['dpkg-deb', '--field', str(archive), 'Package', 'Version']).decode().splitlines()
    identity = dict(line.split(': ', 1) for line in fields)
    expected = packages.get(identity.get('Package'))
    if not expected or identity.get('Version') != expected['version'] or expected['sha256'] != hashlib.sha256(archive.read_bytes()).hexdigest():
        raise ValueError('Unpinned or mismatched COLMAP dependency: ' + archive.name)
subprocess.run(['apt-get', 'install', '-y', '--no-install-recommends', *versions], check=True)
if hashlib.sha256(Path('/usr/bin/colmap').read_bytes()).hexdigest() != profile['binarySha256']:
    raise ValueError('COLMAP binary does not match the discovered pinned profile')
Path('/opt/colmap').mkdir(parents=True, exist_ok=True)
Path('/opt/colmap/runtime-profile.json').write_text(json.dumps(profile, sort_keys=True))
