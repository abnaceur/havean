"""Trusted one-exec trampoline: confinement precedes every native media parser."""
import hashlib
import json
import os
from pathlib import Path
import resource
import sys


def main():
    from .sources import SourceError
    from .decoder_isolation import enter_decoder_sandbox
    try:
        directory, tool, name, mode = sys.argv[1:]
        root = Path(directory).resolve(strict=True)
        if tool not in ('ffmpeg', 'ffprobe') or mode not in ('probe', 'thumbnail', 'frames') or (tool == 'ffprobe') != (mode == 'probe'):
            raise SourceError('MEDIA_PROFILE_INVALID')
        source = root / name
        if Path(name).name != name or source.is_symlink() or source.resolve(strict=True).parent != root or not source.is_file():
            raise SourceError('MEDIA_SOURCE_PATH_INVALID')
        executable = '/opt/media/bin/' + tool
        profile = json.loads(Path('/opt/media/runtime-profile.json').read_text())
        if profile['version'] != '7.1.5' or hashlib.sha256(Path(executable).read_bytes()).hexdigest() != profile['binaries'][tool]:
            raise SourceError('MEDIA_BINARY_MISMATCH')
        resource.setrlimit(resource.RLIMIT_AS, (512*1024*1024, 512*1024*1024))
        resource.setrlimit(resource.RLIMIT_CPU, (30, 30) if mode == 'frames' else (10, 10))
        resource.setrlimit(resource.RLIMIT_FSIZE, (16*1024*1024, 16*1024*1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
        enter_decoder_sandbox(root, media_executable=executable)
        arguments = [executable, '-v', 'info' if mode == 'frames' else 'error', '-protocol_whitelist', 'file,pipe']
        if mode == 'probe':
            arguments += ['-threads', '1', '-show_format', '-show_streams', '-of', 'json', str(source)]
        elif mode == 'thumbnail':
            # Native autorotation precedes scaling; no audio, metadata or external URLs.
            arguments += ['-nostdin', '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1', '-i', str(source), '-map', '0:v:0', '-an', '-sn', '-dn',
                          '-frames:v', '1', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease',
                          '-map_metadata', '-1', '-f', 'image2', '-c:v', 'png', '-threads:v', '1', '-y', str(root/'thumbnail.png')]
        else:
            # Select by decoded input presentation time; showinfo records the
            # selected actual PTS before encoding, rather than inventing an fps clock.
            arguments += ['-nostdin', '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1', '-i', str(source), '-map', '0:v:0', '-an', '-sn', '-dn',
                          '-frames:v', '600', '-vf', "select='isnan(prev_selected_t)+gte(t-prev_selected_t,1)',scale=1600:1600:force_original_aspect_ratio=decrease,showinfo",
                          '-fps_mode', 'vfr', '-map_metadata', '-1', '-f', 'image2', '-c:v', 'png', '-threads:v', '1', '-start_number', '1', '-y', str(root/'frame-%03d.png')]
        os.execve(executable, arguments, {'PATH': '/opt/media/bin', 'HOME': str(root), 'LANG': 'C'})
    except Exception:
        # Never emit container metadata, paths, source text or native diagnostics.
        print(json.dumps({'ok': False, 'code': 'MEDIA_NATIVE_UNAVAILABLE'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
