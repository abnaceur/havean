"""Export exact audited CPU bytes; this is not production distribution approval."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

IMAGE = 'sha256:fd94acd403520f75ff6bd0482fe1d2d19378c5793313e8214e66eaf7989d0cff'
COMMIT = '0bd66d901c7549051e21e8f648777f802eb20a73'
BINARY = '424e1a4a560165fbfb4ceca942aa307106db5b2ed5e3d6b7cb1e441a4a305e3f'
BASE_LIBRARIES = {'libc.so.6', 'libm.so.6', 'libpthread.so.0', 'libdl.so.2', 'librt.so.1'}


def export(target):
    target = Path(target)
    if target.exists() and any(target.iterdir()):
        raise ValueError('New empty runtime export directory required')
    target.mkdir(parents=True, exist_ok=True)
    audit = json.loads(Path('/opt/colmap/source-exclusions.json').read_text())
    if (audit['sourceCommit'] != COMMIT or audit['binarySha256'] != BINARY
            or audit['restrictedBuiltObjects'] or audit['builtObjectCount'] != 145
            or any(audit[key] for key in ('cuda', 'openGL', 'lsd', 'cgal', 'productionEnabled'))):
        raise ValueError('Exact excluded-component object audit required')
    binary = Path('/usr/bin/colmap')
    if hashlib.sha256(binary.read_bytes()).hexdigest() != BINARY:
        raise ValueError('Audited CPU executable changed')
    files = []
    packages = {}

    def copy(source, name, package=None):
        source = Path(source).resolve(strict=True)
        if not source.is_file() or name.startswith('/') or '..' in Path(name).parts:
            raise ValueError('Regular confined runtime file required')
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        destination.chmod(0o755 if name.startswith('bin/') else 0o644)
        files.append({'name': name, 'bytes': str(source.stat().st_size),
                      'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'package': package})

    copy(binary, 'bin/colmap')
    dependencies = subprocess.check_output(['ldd', str(binary)], text=True)
    if 'not found' in dependencies:
        raise ValueError('Unresolved source dependency')
    for line in dependencies.splitlines():
        match = re.fullmatch(r'\s*(\S+) => (/\S+) \(0x[0-9a-f]+\)', line)
        if not match:
            if 'linux-vdso' in line or re.fullmatch(r'\s*/\S+/ld-linux-\S+ \(0x[0-9a-f]+\)', line):
                continue
            raise ValueError('Unexpected native dependency record')
        soname, source = match.groups()
        if soname in BASE_LIBRARIES:
            continue
        if not re.fullmatch(r'[A-Za-z0-9_.+-]+', soname) or any(word in soname.lower() for word in ('cuda', 'siftgpu', 'glx', 'opengl')):
            raise ValueError('Unsupported runtime dependency')
        real = str(Path(source).resolve(strict=True))
        owner = subprocess.check_output(['dpkg-query', '-S', real], text=True).strip().split(': /', 1)[0]
        if '\n' in owner or not re.fullmatch(r'[a-z0-9+.-]+(?::amd64)?', owner):
            raise ValueError('Unique installed dependency owner required')
        version = subprocess.check_output(['dpkg-query', '-W', '-f=${Version}', owner], text=True)
        component = owner.split(':')[0]
        if component not in packages:
            notice = Path('/usr/share/doc') / component / 'copyright'
            copy(notice, 'notices/' + component + '.copyright', component)
            packages[component] = version
        copy(source, 'lib/' + soname, component)
    source = Path('/source/colmap-' + COMMIT)
    for name, origin in {'COLMAP.COPYING.txt': 'COPYING.txt',
                         'VLFeat.LICENSE': 'src/thirdparty/VLFeat/LICENSE',
                         'PoissonRecon.LICENSE': 'src/thirdparty/PoissonRecon/LICENSE'}.items():
        copy(source / origin, 'notices/' + name)
    profile = {'schemaVersion': 1, 'id': 'colmap-3.10-source-cpu-runtime-v1',
               'sourceImage': IMAGE, 'sourceCommit': COMMIT, 'binarySha256': BINARY,
               'gpuAvailable': False, 'productionEnabled': False,
               'libraryDirectory': '/opt/colmap/lib', 'buildObjectCount': 145,
               'excludedComponents': ['SiftGPU', 'LSD', 'CUDA', 'OpenGL', 'CGAL'],
               'baseLibraries': sorted(BASE_LIBRARIES), 'packages': dict(sorted(packages.items())),
               'files': sorted(files, key=lambda entry: entry['name']),
               'distributionStatus': 'pending exact runtime review; no production admission'}
    (target / 'runtime-profile.json').write_text(json.dumps(profile, indent=2) + '\n')
    print(json.dumps({'label': 'P', 'sourceImage': IMAGE, 'nativeFiles': len(files),
                      'dependencyPackages': len(packages), 'productionEnabled': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output')
    export(parser.parse_args().output)
