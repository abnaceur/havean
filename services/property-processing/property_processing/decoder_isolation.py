"""Linux x86-64 decoder confinement: one job directory, no sockets or new processes.

Unprivileged Landlock ABI >=6 and stacked seccomp are mandatory; never fall back
silently. Container/resource limits and API grants remain independent boundaries.
"""
import ctypes
import errno
import os
from pathlib import Path
import platform
import stat
from .errors import SourceError


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


def enter_decoder_sandbox(directory: Path, *, media_executable: str | None = None, ocr_models: bool = False, camera_inputs: Path | None = None, training_inputs: Path | None = None):
    if sum((ocr_models, media_executable is not None, camera_inputs is not None, training_inputs is not None)) > 1:
        raise SourceError('SOURCE_SANDBOX_PROFILE_INVALID')
    if media_executable is not None and media_executable not in ('/opt/media/bin/ffmpeg', '/opt/media/bin/ffprobe'):
        raise SourceError('MEDIA_EXECUTABLE_INVALID')
    abi = landlock_abi()
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    root = directory.resolve(strict=True)
    native_executable = '/usr/bin/colmap' if camera_inputs is not None else media_executable
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
        if ocr_models:
            models = Path('/opt/ocr-models')
            if not models.is_dir() or models.is_symlink():
                raise SourceError('OCR_MODELS_UNAVAILABLE')
            rules.extend((path, (1 << 2) | (1 << 3)) for path in (models, Path('/proc/cpuinfo'), Path('/proc/meminfo')))
        if camera_inputs is not None:
            inputs = camera_inputs.resolve(strict=True)
            if camera_inputs.is_symlink() or not inputs.is_dir() or inputs == Path('/') or inputs == code or inputs in code.parents or inputs == root or inputs in root.parents:
                raise SourceError('SOURCE_SANDBOX_PATH_INVALID')
            rules.extend((path, (1 << 2) | (1 << 3)) for path in (inputs, Path('/opt/colmap'), Path('/proc/cpuinfo'), Path('/proc/meminfo')))
            # The dynamic ELF loader is part of the pinned immutable base image.
            rules.append((Path('/lib64/ld-linux-x86-64.so.2'), (1 << 0) | (1 << 2)))
        if training_inputs is not None:
            inputs = training_inputs.resolve(strict=True)
            if training_inputs.is_symlink() or not inputs.is_dir() or inputs == Path('/') or inputs == code or inputs in code.parents or inputs == root or inputs in root.parents:
                raise SourceError('SOURCE_SANDBOX_PATH_INVALID')
            rules.extend((path, (1 << 2) | (1 << 3)) for path in (inputs, Path('/usr/local/cuda'), Path('/opt/venv'), Path('/proc/self'), Path('/proc/driver/nvidia'), Path('/sys/devices'), Path('/proc/cpuinfo'), Path('/proc/meminfo'), Path('/proc/sys/vm/mmap_min_addr'), Path('/proc/devices')))
            # CUDA names its newly created threads through task/<tid>/comm.
            # Scope writes to this process's task directory, never all of /proc.
            # No create/remove/execute rights; network and process spawning stay denied.
            rules.append((Path('/proc/self/task'), (1 << 1) | (1 << 14)))
            devices = [Path('/dev/nvidiactl'), Path('/dev/nvidia-uvm'), Path('/dev/nvidia-uvm-tools'), *Path('/dev').glob('nvidia[0-9]*')]
            for device in devices:
                if device.exists():
                    if device.is_symlink() or not stat.S_ISCHR(device.stat().st_mode):
                        raise SourceError('GPU_DEVICE_INVALID')
                    rules.append((device, (1 << 1) | (1 << 2) | (1 << 15)))
        if native_executable is not None:
            rules.append((Path(native_executable), (1 << 0) | (1 << 2)))
        writable = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 8) | (1 << 14)
        if training_inputs is not None:
            writable |= 1 << 13  # REFER: finalized tier files move between job-local directories.
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
    if training_inputs is not None:
        # CUDA creates a scoped abstract UVM listener even for single-device work.
        # Only AF_UNIX/SOCK_SEQPACKET|CLOEXEC/protocol 0 can be created. Landlock
        # scopes abstract sockets; connect, accept, send/receive and IP stay denied.
        denied.difference_update({41, 49, 50, 54})
        socket_checks = []
        for offset, expected in ((16, 1), (24, 0x80005), (32, 0)):
            socket_checks.extend(((0x20, 0, 0, offset), (0x15, 1, 0, expected),
                                  (0x06, 0, 0, 0x00050000 | errno.EPERM)))
        socket_checks.append((0x06, 0, 0, 0x7fff0000))
        filters.append((0x15, 0, len(socket_checks), 41))
        filters.extend(socket_checks)
    if native_executable is not None:
        denied.remove(59)  # execve is restricted to the one immutable native file by Landlock.
    if native_executable is not None or ocr_models or training_inputs is not None:
        denied.remove(56)
        # Permit only pthread clones sharing VM/signal handlers in the same thread group.
        # No fork, namespace, parent process or exit-signal flags. clone3 returns ENOSYS
        # so libc falls back to inspectable clone flags; its opaque struct is never allowed.
        thread_checks = [(0x20, 0, 0, 20), (0x15, 1, 0, 0),
                         (0x06, 0, 0, 0x00050000 | errno.EPERM),
                         (0x20, 0, 0, 16), (0x54, 0, 0, 0x00010900),
                         (0x15, 1, 0, 0x00010900), (0x06, 0, 0, 0x00050000 | errno.EPERM),
                         (0x20, 0, 0, 16), (0x54, 0, 0, (~0x013d0f00) & 0xffffffff),
                         (0x15, 1, 0, 0), (0x06, 0, 0, 0x00050000 | errno.EPERM),
                         (0x06, 0, 0, 0x7fff0000)]
        filters.append((0x15, 0, len(thread_checks), 56))
        filters.extend(thread_checks)
    for syscall in sorted(denied):
        filters.extend(((0x15, 0, 1, syscall), (0x06, 0, 0, 0x00050000 | (errno.ENOSYS if (native_executable is not None or ocr_models or training_inputs is not None) and syscall == 435 else errno.EPERM))))
    filters.append((0x06, 0, 0, 0x7fff0000))
    instructions = (Instruction * len(filters))(*(Instruction(*entry) for entry in filters))
    program = Program(len(filters), instructions)
    if libc.prctl(22, 2, ctypes.byref(program), 0, 0):
        raise SourceError('SOURCE_SANDBOX_UNAVAILABLE')
    return {'profile': 'linux-landlock-seccomp-gsplat-v1' if training_inputs is not None else 'linux-landlock-seccomp-colmap-v1' if camera_inputs is not None else 'linux-landlock-seccomp-ocr-v1' if ocr_models else 'linux-landlock-seccomp-media-v1' if media_executable else 'linux-landlock-seccomp-decoder-v1', 'landlockAbi': abi}
