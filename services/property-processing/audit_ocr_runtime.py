"""Read-only installed native inventory; never enables OCR or approves licenses."""
import base64
import hashlib
import importlib.metadata
import io
import json
import os
from pathlib import Path
import re
import struct
import tarfile


def elf_dependencies(path):
    """Read bounded ELF64 dynamic metadata without loading the library."""
    size = path.stat().st_size
    with path.open('rb') as stream:
        def read(offset, length):
            if offset < 0 or length < 0 or offset + length > size:
                raise ValueError('ELF metadata outside file')
            stream.seek(offset)
            data = stream.read(length)
            if len(data) != length:
                raise ValueError('Truncated ELF metadata')
            return data
        header = read(0, 64)
        if header[:7] != b'\x7fELF\x02\x01\x01':
            raise ValueError('ELF64 little-endian library required')
        offset = struct.unpack_from('<Q', header, 32)[0]
        entry_size, count = struct.unpack_from('<HH', header, 54)
        if entry_size != 56 or not 1 <= count <= 4096:
            raise ValueError('Bounded ELF program headers required')
        segments = [struct.unpack('<IIQQQQQQ', read(offset + i * 56, 56)) for i in range(count)]
        dynamic = [segment for segment in segments if segment[0] == 2]
        if len(dynamic) != 1 or dynamic[0][5] > 1048576 or dynamic[0][5] % 16:
            raise ValueError('Bounded ELF dynamic segment required')
        entries = []
        for i in range(dynamic[0][5] // 16):
            tag, value = struct.unpack('<qQ', read(dynamic[0][2] + i * 16, 16))
            if tag == 0:
                break
            entries.append((tag, value))
        else:
            raise ValueError('Terminated ELF dynamic segment required')
        strings = {tag: value for tag, value in entries if tag in (5, 10)}
        if set(strings) != {5, 10} or not 1 <= strings[10] <= 32 * 1024 * 1024:
            raise ValueError('Bounded ELF string table required')
        loads = [s for s in segments if s[0] == 1 and s[3] <= strings[5] and strings[5] + strings[10] <= s[3] + s[5]]
        if len(loads) != 1:
            raise ValueError('File-backed ELF string table required')
        table = read(loads[0][2] + strings[5] - loads[0][3], strings[10])
        def string(index):
            end = table.find(b'\0', index) if index < len(table) else -1
            if index < 0 or end < index or end - index > 4096:
                raise ValueError('Bounded terminated ELF string required')
            return table[index:end].decode('utf8', errors='strict')
        return {'needed': [string(value) for tag, value in entries if tag == 1],
                'soname': next((string(value) for tag, value in entries if tag == 14), None),
                'searchPaths': [string(value) for tag, value in entries if tag in (15, 29)]}


def deb_data_archive(data):
    if data[:8] != b'!<arch>\n' or len(data) > 64 * 1024 * 1024:
        raise ValueError('Bounded Debian ar archive required')
    offset, found, count = 8, None, 0
    while offset < len(data):
        if offset + 60 > len(data) or count >= 32:
            raise ValueError('Bounded Debian member header required')
        header = data[offset:offset + 60]
        name = header[:16].decode('ascii').strip().removesuffix('/')
        if header[58:] != b'`\n' or not header[48:58].strip().isdigit():
            raise ValueError('Invalid Debian member header')
        size = int(header[48:58])
        start = offset + 60
        if start + size > len(data):
            raise ValueError('Truncated Debian member')
        if name.startswith('data.tar.'):
            if found is not None:
                raise ValueError('Unique Debian data archive required')
            found = data[start:start + size]
        offset = start + size + size % 2
        count += 1
    if found is None:
        raise ValueError('Debian data archive required')
    return found


def bind_extracted_packages(records, package_pins):
    files = {record['path']: record for record in records}
    for name, pin in package_pins.items():
        filename = pin['file']
        if Path(filename).name != filename:
            raise ValueError('Exact Debian archive filename required')
        path = Path('/audit/debs') / filename
        if path.is_symlink() or path.stat().st_size > 64 * 1024 * 1024:
            raise ValueError('Bounded regular Debian archive required')
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != pin['sha256']:
            raise ValueError('Debian archive checksum mismatch')
        with tarfile.open(fileobj=io.BytesIO(deb_data_archive(data)), mode='r:*') as archive:
            count = 0
            for member in archive:
                count += 1
                if count > 10000:
                    raise ValueError('Bounded Debian file inventory required')
                candidate = '/' + member.name.removeprefix('./')
                record = files.get(candidate)
                if record is None or not member.isfile():
                    continue
                if member.size > 64 * 1024 * 1024:
                    raise ValueError('Bounded Debian native file required')
                stream = archive.extractfile(member)
                if stream is None or hashlib.file_digest(stream, 'sha256').hexdigest() != record['sha256']:
                    raise ValueError('Installed native file differs from pinned Debian archive')
                record['packageRecords'].append({'package': name, 'version': pin['version'],
                                                'extractedArchiveSha256': pin['sha256'],
                                                'actualArchiveFileHashMatched': True,
                                                'registeredInDpkg': False})


def trace_system_dependencies(names, indexed_names, package_pins):
    roots = [Path('/usr/lib/x86_64-linux-gnu').resolve(), Path('/usr/local/lib').resolve()]
    pending, seen, records, missing = set(names), set(indexed_names), [], set()
    while pending:
        name = min(pending)
        pending.remove(name)
        if name in seen:
            continue
        seen.add(name)
        if not re.fullmatch(r'[A-Za-z0-9_.+-]+', name) or len(seen) > 2000:
            raise ValueError('Bounded native dependency names required')
        matches = {candidate.resolve() for root in roots for candidate in [root / name] if candidate.is_file()}
        if len(matches) != 1:
            missing.add(name)
            continue
        path = matches.pop()
        if path.parent not in roots or path.stat().st_size > 1024 ** 3:
            raise ValueError('System native dependency escapes audited roots')
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        metadata = elf_dependencies(path)
        records.append({'requestedName': name, 'path': str(path), 'bytes': str(path.stat().st_size),
                        'sha256': digest, 'packageRecords': [], **metadata})
        pending.update(set(metadata['needed']) - seen)
    # Bind observed system files to installed dpkg metadata where available.
    # Extracted, unregistered packages remain explicitly unattributed here.
    status_file = Path('/var/lib/dpkg/status')
    if status_file.stat().st_size > 4 * 1024 * 1024:
        raise ValueError('Bounded installed package metadata required')
    packages = {}
    for block in status_file.read_text().split('\n\n'):
        fields = dict(line.split(': ', 1) for line in block.splitlines() if ': ' in line and not line.startswith(' '))
        if fields.get('Status') == 'install ok installed':
            packages[fields['Package']] = fields['Version']
    files = {record['path']: record for record in records}
    total = 0
    for listing in Path('/var/lib/dpkg/info').glob('*.list'):
        size = listing.stat().st_size
        total += size
        if size > 1024 * 1024 or total > 32 * 1024 * 1024:
            raise ValueError('Bounded installed package file lists required')
        package = listing.name.removesuffix('.list').split(':')[0]
        if package not in packages:
            continue
        for value in listing.read_text().splitlines():
            if value.startswith(('/lib/', '/usr/lib/', '/usr/local/lib/')) and '.so' in Path(value).name:
                record = files.get(str(Path(value).resolve()))
                if record is not None:
                    provider = {'package': package, 'version': packages[package]}
                    if provider not in record['packageRecords']:
                        record['packageRecords'].append(provider)
    bind_extracted_packages(records, package_pins)
    return records, sorted(missing)


def audit(profile):
    if profile.get('enabled') is not False or profile.get('schemaVersion') != 1:
        raise ValueError('Disabled investigation profile required')
    roots = [Path('/usr/local/lib/python3.12/site-packages'), Path('/opt/ocr-models/native')]
    owners = {}
    normalize = lambda name: re.sub(r'[_.-]+', '-', name).lower()
    pins = {normalize(name): record for name, record in profile['packages'].items()}
    for distribution in importlib.metadata.distributions():
        for file in distribution.files or ():
            if '.so' in file.name:
                owners.setdefault(str(distribution.locate_file(file)), []).append((distribution, file))
    records = []
    for root in roots:
        for path in sorted(root.rglob('*')):
            if '.so' not in path.name or not path.is_file():
                continue
            if path.is_symlink() or path.stat().st_size > 1024 ** 3 or len(records) >= 1000:
                raise ValueError('Bounded regular native inventory required')
            with path.open('rb') as stream:
                if stream.read(4) != b'\x7fELF':
                    continue
                stream.seek(0)
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            providers = []
            for distribution, file in owners.get(str(path), []):
                name = normalize(distribution.metadata['Name'])
                pin = pins.get(name)
                if not pin or pin['version'] != distribution.version:
                    raise ValueError('Native provider lacks exact wheel pin')
                expected = file.hash
                matches = expected is not None and expected.mode == 'sha256' and expected.value == base64.urlsafe_b64encode(bytes.fromhex(digest)).decode().rstrip('=')
                providers.append({'package': name, 'version': distribution.version,
                                  'wheelSha256': pin['artifacts'][0]['sha256'],
                                  'matchesWheelRecord': matches})
            native_pin = profile['nativeLibraries'].get(path.name)
            pin_matches = native_pin is not None and digest == native_pin['sha256']
            if root == roots[1] and not pin_matches:
                raise ValueError('Native replacement lacks exact library pin')
            records.append({'root': 'site-packages' if root == roots[0] else 'native-replacements',
                            'path': str(path.relative_to(root)), 'bytes': str(path.stat().st_size),
                            'sha256': digest, 'providers': providers,
                            'matchesReplacementPin': pin_matches, **elf_dependencies(path)})
    sonames = {item['soname'] for item in records} | {Path(item['path']).name for item in records}
    outside = sorted({name for item in records for name in item['needed'] if name not in sonames})
    system, missing = trace_system_dependencies(outside, sonames, profile['debianPackages'])
    return {'schemaVersion': 1, 'label': 'O/R/P/V', 'status': 'installed-native-inventory-only',
            'libraries': records, 'nativeFileCount': len(records),
            'neededOutsideInventoriedRoots': outside, 'systemLibraries': system,
            'unresolvedSystemDependencies': missing,
            'limits': 'Static installed ELF and provider/hash evidence only. System lookup covers fixed library roots, not execution-specific loader search or exercised code paths. No build linkage, complete redistribution, model accuracy or production approval.',
            'productionEnabled': False, 'physicalGpu': False}


if __name__ == '__main__':
    image = os.environ.get('OCR_NATIVE_AUDIT_IMAGE_ID', '')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise ValueError('Observed immutable investigation image required')
    print(json.dumps({**audit(json.loads(Path('/audit/pins.json').read_text())), 'image': image}, indent=2))
