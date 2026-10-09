"""Linux x86-64 decoder confinement: one job directory, no sockets or new processes.

Unprivileged Landlock ABI >=6 and stacked seccomp are mandatory; never fall back
silently. Container/resource limits and API grants remain independent boundaries.
"""
import ctypes
import errno
import os
from pathlib import Path
import platform
from .sources import SourceError


class Ruleset(ctypes.Structure):
    _fields_ = [('handled_access_fs', ctypes.c_uint64), ('handled_access_net', ctypes.c_uint64), ('scoped', ctypes.c_uint64)]


class PathRule(ctypes.Structure):
    _pack_ = 1
    _fields_ = [('allowed_access', ctypes.c_uint64), ('parent_fd', ctypes.c_int32)]


class Instruction(ctypes.Structure):
    _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte), ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint32)]


class Program(ctypes.Structure):
    _fields_ = [('length', ctypes.c_ushort), ('filter', ctypes.POINTER(Instruction))]


READ_ROOTS = ('/usr/local/lib', '/usr/lib', '/lib', '/lib64', '/usr/share/fonts', '/etc/fonts',
              '/etc/ld.so.cache', '/etc/localtime', '/dev/urandom')


def landlock_abi():
    if platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise SourceError('SOURCE_SANDBOX_UNAVAILABLE')
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    abi = libc.syscall(444, None, 0, 1)
    if abi < 6:
        raise SourceError('SOURCE_SANDBOX_UNAVAILABLE')
    return abi


def enter_decoder_sandbox(directory: Path):
    abi = landlock_abi()
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    root = directory.resolve(strict=True)
    code = Path(__file__).resolve().parent.parent
    if root == code or code in root.parents or root == Path('/'):
        raise SourceError('SOURCE_SANDBOX_PATH_INVALID')
    # Set no_new_privs and disable ptrace/core-dump access before parsing input.
    if libc.prctl(38, 1, 0, 0, 0) or libc.prctl(4, 0, 0, 0, 0):
        raise SourceError('SOURCE_SANDBOX_UNAVAILABLE')
    handled = (1 << 16)-1
    if abi >= 9:
        handled |= 1 << 16  # resolve Unix socket paths, still forbidden by seccomp
    ruleset = Ruleset(handled, 3, 3)  # TCP denied; isolate signals/abstract sockets
    descriptor = libc.syscall(444, ctypes.byref(ruleset), ctypes.sizeof(ruleset), 0)
    if descriptor < 0:
        raise SourceError('SOURCE_SANDBOX_UNAVAILABLE')
    try:
        rules = [(Path(value), (1 << 2) | (1 << 3)) for value in READ_ROOTS]
        rules.append((code, (1 << 2) | (1 << 3)))
        writable = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 8) | (1 << 14)
        rules.append((root, writable))
        for path, access in rules:
            if not path.exists():
                continue
            fd = os.open(path, os.O_PATH | os.O_CLOEXEC)
            try:
                if not path.is_dir():
                    access &= ~(1 << 3)
                rule = PathRule(access, fd)
                if libc.syscall(445, descriptor, 1, ctypes.byref(rule), 0):
                    raise SourceError('SOURCE_SANDBOX_UNAVAILABLE')
            finally:
                os.close(fd)
        if libc.syscall(446, descriptor, 0):
            raise SourceError('SOURCE_SANDBOX_UNAVAILABLE')
    finally:
        os.close(descriptor)
    # Linux x86-64 audit architecture and syscall ABI. Reject x32 and other arches.
    filters = [(0x20, 0, 0, 4), (0x15, 1, 0, 0xc000003e), (0x06, 0, 0, 0x80000000),
               (0x20, 0, 0, 0), (0x35, 0, 1, 0x40000000), (0x06, 0, 0, 0x80000000)]
    denied = set(range(41, 56)) | {56, 57, 58, 59, 62, 101, 155, 161, 165, 166, 200, 234,
                                    272, 288, 299, 303, 304, 307, 308, 310, 311, 317, 321,
                                    322, 425, 426, 427, 434, 435, 438}
    for syscall in sorted(denied):
        filters.extend(((0x15, 0, 1, syscall), (0x06, 0, 0, 0x00050000 | errno.EPERM)))
    filters.append((0x06, 0, 0, 0x7fff0000))
    instructions = (Instruction * len(filters))(*(Instruction(*entry) for entry in filters))
    program = Program(len(filters), instructions)
    if libc.prctl(22, 2, ctypes.byref(program), 0, 0):
        raise SourceError('SOURCE_SANDBOX_UNAVAILABLE')
    return {'profile': 'linux-landlock-seccomp-decoder-v1', 'landlockAbi': abi}
