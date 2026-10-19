import struct
import pytest
from audit_ocr_runtime import deb_data_archive, elf_dependencies


def elf_fixture(path):
    # Synthetic ELF metadata only; not an executable or model fixture.
    header = bytearray(64)
    header[:7] = b'\x7fELF\x02\x01\x01'
    struct.pack_into('<Q', header, 32, 64)
    struct.pack_into('<HH', header, 54, 56, 2)
    table = b'\0libfixture.so\0owned.so\0$ORIGIN\0'
    dynamic = b''.join(struct.pack('<qQ', tag, value) for tag, value in
                       [(5, 4096 + 384), (10, len(table)), (1, 1), (14, 15), (29, 24), (0, 0)])
    programs = struct.pack('<IIQQQQQQ', 1, 4, 0, 4096, 4096, 384 + len(table), 384 + len(table), 8)
    programs += struct.pack('<IIQQQQQQ', 2, 4, 192, 4288, 4288, len(dynamic), len(dynamic), 8)
    body = header + programs
    body.extend(b'\0' * (384 - len(body)))
    body[192:192 + len(dynamic)] = dynamic
    body.extend(table)
    path.write_bytes(body)
    return body


def test_reads_native_links_without_loading_synthetic_library(tmp_path):
    path = tmp_path / 'fixture.so'
    elf_fixture(path)
    assert elf_dependencies(path) == {'needed': ['libfixture.so'], 'soname': 'owned.so', 'searchPaths': ['$ORIGIN']}


def test_refuses_outside_file_and_oversized_native_metadata(tmp_path):
    path = tmp_path / 'fixture.so'
    body = elf_fixture(path)
    struct.pack_into('<Q', body, 32, len(body))
    path.write_bytes(body)
    with pytest.raises(ValueError, match='outside file'):
        elf_dependencies(path)
    body = elf_fixture(path)
    struct.pack_into('<Q', body, 192 + 16 + 8, 32 * 1024 * 1024 + 1)
    path.write_bytes(body)
    with pytest.raises(ValueError, match='string table'):
        elf_dependencies(path)


def test_refuses_unterminated_dynamic_metadata(tmp_path):
    path = tmp_path / 'fixture.so'
    body = elf_fixture(path)
    struct.pack_into('<qQ', body, 192 + 5 * 16, 1, 1)
    path.write_bytes(body)
    with pytest.raises(ValueError, match='Terminated'):
        elf_dependencies(path)


def test_debian_archive_refuses_truncated_and_ambiguous_members():
    def member(name, body):
        return (name.encode().ljust(16) + b'0'.ljust(12) + b'0'.ljust(6) + b'0'.ljust(6)
                + b'100644'.ljust(8) + str(len(body)).encode().ljust(10) + b'`\n'
                + body + (b'\n' if len(body) % 2 else b''))
    archive = b'!<arch>\n' + member('data.tar.xz/', b'abc')
    assert deb_data_archive(archive) == b'abc'
    with pytest.raises(ValueError, match='Truncated'):
        deb_data_archive(archive[:-2])
    with pytest.raises(ValueError, match='Unique'):
        deb_data_archive(archive + member('data.tar.xz/', b'other'))
