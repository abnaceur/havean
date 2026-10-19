"""Inspect every exported image layer, including contents hidden by whiteouts."""
import hashlib
import json
import subprocess
import tarfile

IMAGE = 'haven-colmap-runtime:3.10-source-cpu-v1'
FORBIDDEN = ('source/', 'build/', 'usr/local/cuda/', 'usr/include/colmap/',
             'usr/bin/gcc', 'usr/bin/g++', 'usr/bin/cmake', 'tmp/colmap-source')


class PrefixReader:
    def __init__(self, prefix, source):
        self.prefix = prefix
        self.source = source

    def read(self, size):
        first = self.prefix[:size]
        self.prefix = self.prefix[len(first):]
        return first + self.source.read(size - len(first))


def audit():
    inspected = json.loads(subprocess.check_output(['docker', 'image', 'inspect', IMAGE], text=True))[0]
    process = subprocess.Popen(['docker', 'image', 'save', IMAGE], stdout=subprocess.PIPE)
    layers = []
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|*') as archive:
            for entry in archive:
                if not entry.isfile() or not (entry.name.endswith('.tar') or entry.name.startswith('blobs/sha256/')):
                    continue
                stream = archive.extractfile(entry)
                header = stream.read(512)
                # Docker's containerd store exports extensionless OCI blobs.
                # JSON configuration blobs are not filesystem layers.
                if not (header[257:262] == b'ustar' or header[:2] == b'\x1f\x8b'):
                    continue
                count = 0
                forbidden = []
                with tarfile.open(fileobj=PrefixReader(header, stream), mode='r|*') as layer:
                    for item in layer:
                        count += 1
                        name = item.name.removeprefix('./')
                        if name.startswith(FORBIDDEN) or any(part in ('SiftGPU', 'LSD') for part in name.split('/')):
                            forbidden.append(name)
                if forbidden:
                    raise ValueError('Forbidden source/build/restricted material in image layer: ' + repr(forbidden[:10]))
                layers.append({'layer': entry.name, 'entriesInspected': count})
        if process.wait() or not layers or len(layers) != len(inspected['RootFS']['Layers']):
            raise ValueError('Complete image layer export required')
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        process.stdout.close()
    print(json.dumps({'label': 'P', 'image': inspected['Id'], 'bytes': str(inspected['Size']),
                      'layers': layers, 'restrictedOrBuildMaterialFound': False,
                      'imageConfigurationSha256': hashlib.sha256(json.dumps(inspected['Config'], sort_keys=True).encode()).hexdigest(),
                      'productionEnabled': False, 'gpuAvailable': False}, indent=2))


if __name__ == '__main__':
    audit()
