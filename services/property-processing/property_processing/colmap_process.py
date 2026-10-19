"""Confine one fixed COLMAP executable before it parses any source pixels."""
import argparse
import os
from pathlib import Path
from .decoder_isolation import enter_decoder_sandbox


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command or command[0] not in ('feature_extractor', 'matches_importer', 'mapper', 'model_converter', 'image_undistorter'):
        raise ValueError('Allowlisted camera processing command required')
    root = Path(args.output).resolve(strict=True)
    os.chdir(root)
    environment = {'PATH': '/usr/bin:/bin', 'HOME': str(root), 'TMPDIR': str(root),
                   'OMP_NUM_THREADS': '4', 'OPENBLAS_NUM_THREADS': '4', 'LD_LIBRARY_PATH': '/opt/colmap/lib'}
    enter_decoder_sandbox(root, camera_inputs=Path(args.input))
    # No shell, network, fork or foreign job access survives this boundary.
    # Only pthread creation and this pinned native executable are permitted.
    os.execve('/usr/bin/colmap', ['/usr/bin/colmap', *command], environment)


if __name__ == '__main__':
    main()
