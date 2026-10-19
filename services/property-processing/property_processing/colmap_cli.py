"""Bounded private CPU camera solve, never a publication or metric-scale receipt.

This CLI runs in the isolated reconstruction image. API lineage/lease integration
is required before it can become a processing stage; development smoke output
does not create an artifact or bypass independent review.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import signal
import struct
import subprocess
import sqlite3
import time
import platform
import sys
from .training_data import load_training_dataset, UnusableCalibrationError
from .reconstruction_quality import summarize_model, select_complete_model
from .reconstruction_pairs import camera_groups, matching_pairs, recovery_pairs


def validate_inputs(root):
    root = Path(root).resolve(strict=True)
    manifest_path = root / 'manifest.json'
    if manifest_path.is_symlink() or manifest_path.stat().st_size > 1048576:
        raise ValueError('Bounded regular training manifest required')
    manifest = json.loads(manifest_path.read_text())
    frames = manifest.get('frames')
    if manifest.get('schemaVersion') != 1 or not isinstance(frames, list) or not 3 <= len(frames) <= 600:
        raise ValueError('Three to six hundred prepared frames required')
    camera_groups(frames)
    names = set()
    total = 0
    for frame in frames:
        name = frame.get('name', '')
        if not re.fullmatch(r'frames/[a-f0-9-]{36}\.png', name) or name in names:
            raise ValueError('Distinct canonical prepared frame names required')
        names.add(name)
        path = root / name
        if path.is_symlink() or path.parent.is_symlink() or path.resolve(strict=True).parent != root / 'frames':
            raise ValueError('Training image must remain inside the private input directory')
        size = path.stat().st_size
        total += size
        if not 33 <= size <= 16 * 1024 * 1024 or total > 384 * 1024 * 1024:
            raise ValueError('Prepared image byte budget exceeded')
        body = path.read_bytes()
        if body[:8] != b'\x89PNG\r\n\x1a\n' or body[12:16] != b'IHDR':
            raise ValueError('Canonical PNG inputs required')
        width, height = struct.unpack('>II', body[16:24])
        if not 1 <= width <= 1600 or not 1 <= height <= 1600 or (width, height) != (frame.get('width'), frame.get('height')):
            raise ValueError('Actual bounded PNG dimensions required')
        if hashlib.sha256(body).hexdigest() != frame.get('sha256'):
            raise ValueError('Prepared image hash mismatch')
    actual = {p.name for p in (root / 'frames').iterdir()}
    if actual != {Path(name).name for name in names}:
        raise ValueError('Unexpected images must not enter reconstruction')
    if manifest.get('publiclyServed') is not False or manifest.get('privacyReviewRequired') is not True:
        raise ValueError('Private pending-review training inputs required')
    return root, manifest


def child_limits():
    resource.setrlimit(resource.RLIMIT_AS, (8 * 1024**3, 8 * 1024**3))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024**3, 1024**3))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def prepare_training_dataset(root, manifest, model, output, run):
    """Actual COLMAP undistortion, with hashes of the resulting calibrated PNGs."""
    destination = output / 'training-input'
    run(['image_undistorter', '--image_path', str(root / 'frames'), '--input_path', str(model),
         '--output_path', str(destination), '--output_type', 'COLMAP', '--max_image_size', '1024'])
    run(['model_converter', '--input_path', str(destination / 'sparse'), '--output_path', str(destination / 'sparse'), '--output_type', 'TXT'])
    frames = []
    for frame in manifest['frames']:
        name = Path(frame['name']).name
        path = destination / 'images' / name
        if not path.is_file():
            continue  # Only registered model views are exported by COLMAP.
        if path.is_symlink() or not 33 <= path.stat().st_size <= 16 * 1024**2:
            raise ValueError('Bounded regular undistorted PNG required')
        body = path.read_bytes()
        if body[:8] != b'\x89PNG\r\n\x1a\n' or body[12:16] != b'IHDR':
            raise ValueError('Actual undistorted PNG required')
        width, height = struct.unpack('>II', body[16:24])
        frames.append({'name': name, 'sha256': hashlib.sha256(body).hexdigest(), 'width': width, 'height': height,
                       'cameraGroupId': frame['cameraGroupId'], 'timestampSeconds': frame.get('timestampSeconds'),
                       'captureKind': frame.get('captureKind', 'video')})
    destination.chmod(0o700)
    (destination / 'manifest.json').write_text(json.dumps({'schemaVersion': 1, 'frames': frames, 'privacyReviewRequired': True,
              'publiclyServed': False, 'sourceManifestSha256': hashlib.sha256((root / 'manifest.json').read_bytes()).hexdigest()}, sort_keys=True))
    verified = load_training_dataset(destination)
    return {'directory': 'training-input', 'datasetFingerprint': verified['fingerprint'], 'viewCount': len(verified['views']),
            'cameras': [{'frame': view['name'], 'width': view['width'], 'height': view['height'], 'intrinsics': [view['K'][0][0],view['K'][1][1],view['K'][0][2],view['K'][1][2]], 'viewMatrix': sum(view['viewmat'],[])} for view in verified['views']],
            'split': verified['split'], 'scale': None, 'unit': 'arbitrary', 'publiclyServed': False}


def solve(root, output, max_seconds=240, prepare_training=False, *, cancelled=None, max_scratch_bytes=512*1024*1024):
    started_ns = time.monotonic_ns()
    command_measurements = []
    def seconds_since(start):
        elapsed = time.monotonic_ns() - start
        return f'{elapsed // 1000000000}.{elapsed % 1000000000:09d}'
    def check_cancelled():
        if cancelled is not None and cancelled():
            raise InterruptedError('Camera solve cancelled')
        if Path(output).exists() and sum(path.stat().st_size for path in Path(output).rglob('*') if path.is_file() and not path.is_symlink()) > max_scratch_bytes:
            raise ValueError('Camera solve exceeded scratch budget')
    check_cancelled()
    root, manifest = validate_inputs(root)
    output = Path(output)
    if output.exists() or not 1 <= max_seconds <= 1200 or not 32*1024*1024 <= max_scratch_bytes <= 2048*1024*1024:
        raise ValueError('New private output directory and bounded deadline required')
    profile = json.loads(Path('/opt/colmap/runtime-profile.json').read_text())
    if profile.get('id') == 'colmap-3.10-source-cpu-runtime-v1':
        from .colmap_runtime import verify_runtime
        verify_runtime('/opt/colmap', profile, installed=True)
    binary = Path('/usr/bin/colmap')
    if hashlib.sha256(binary.read_bytes()).hexdigest() != profile['binarySha256']:
        raise ValueError('Pinned COLMAP executable checksum mismatch')
    output.mkdir(mode=0o700, parents=True)
    database = output / 'database.db'
    sparse = output / 'sparse'
    sparse.mkdir(mode=0o700)
    image_list = output / 'ordered-images.txt'
    image_list.write_text(''.join(Path(frame['name']).name + '\n' for frame in manifest['frames']))
    deadline = time.monotonic() + max_seconds
    env = {'PATH': '/usr/bin:/bin', 'HOME': '/tmp', 'QT_QPA_PLATFORM': 'offscreen', 'OMP_NUM_THREADS': '4', 'OPENBLAS_NUM_THREADS': '4'}
    if profile.get('id') == 'colmap-3.10-source-cpu-runtime-v1':
        env['LD_LIBRARY_PATH'] = '/opt/colmap/lib'

    command_index = 0

    def run(command):
        nonlocal command_index
        check_cancelled()
        command_index += 1
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Camera solve exceeded deadline')
        with (output / (str(command_index) + '-' + command[0] + '.log')).open('xb') as log:
            command_started_ns = time.monotonic_ns()
            process = subprocess.Popen([sys.executable, '-m', 'property_processing.colmap_process', '--input', str(root), '--output', str(output), '--', *command], stdin=subprocess.DEVNULL, stdout=log, stderr=log, env=env,
                                       start_new_session=True, preexec_fn=child_limits)
            try:
                while True:
                    check_cancelled()
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise subprocess.TimeoutExpired(process.args, max_seconds)
                    try:
                        code = process.wait(timeout=min(0.1, remaining))
                        break
                    except subprocess.TimeoutExpired:
                        continue
                if code:
                    raise RuntimeError('COLMAP command failed: ' + command[0])
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                command_measurements.append({'sequence': command_index, 'command': command[0],
                                             'elapsedSeconds': seconds_since(command_started_ns),
                                             'exitCode': process.returncode})

    seen_cameras = set()
    group_assignments = []
    for index, (group_id, entries) in enumerate(camera_groups(manifest['frames']).items()):
        group_list = output / ('camera-group-' + str(index) + '.txt')
        group_list.write_text(''.join(Path(frame['name']).name + '\n' for frame in entries))
        run(['feature_extractor', '--database_path', str(database), '--image_path', str(root / 'frames'),
             '--image_list_path', str(group_list),
             '--ImageReader.single_camera', '1', '--SiftExtraction.use_gpu', '0', '--SiftExtraction.num_threads', '4',
             '--SiftExtraction.max_image_size', '1024', '--SiftExtraction.max_num_features', '2048'])
        with sqlite3.connect(database) as connection:
            cameras = {connection.execute('SELECT camera_id FROM images WHERE name=?', (Path(frame['name']).name,)).fetchone()[0] for frame in entries}
        if len(cameras) != 1 or seen_cameras & cameras:
            raise ValueError('COLMAP merged distinct camera calibration groups')
        seen_cameras.update(cameras)
        group_assignments.append({'cameraGroupId': group_id, 'colmapCameraId': next(iter(cameras)), 'frameNames': [Path(frame['name']).name for frame in entries]})
    with sqlite3.connect(database) as connection:
        usable_frames = connection.execute('SELECT count(*) FROM keypoints WHERE rows>=32').fetchone()[0]
    if usable_frames < 3:
        report = {'schemaVersion': 1, 'state': 'awaiting_input', 'profile': profile['id'], 'models': [],
                  'selectedFrameCount': len(manifest['frames']), 'framesWithUsableFeatures': usable_frames,
                  'cameraGroupAssignments': group_assignments,
                  'matchingFallback': {'attempted': False, 'reason': 'insufficient_image_features'},
                  'nextAction': 'Recapture sharp, well-lit textured views with overlapping doorway and room transitions; blank or blurred frames cannot connect rooms.',
                  'scale': None, 'geometricCoverage': None, 'privacyReviewRequired': True, 'publiclyServed': False,
                  'nativeIsolationProfile': 'linux-landlock-seccomp-colmap-v1'}
        (output / 'camera-solve-report.json').write_text(json.dumps(report, sort_keys=True))
        return report
    pairs = output / 'primary-pairs.txt'
    primary_pairs=matching_pairs(manifest['frames'], image_root=root/'frames')
    pairs.write_text(''.join(a + ' ' + b + '\n' for a,b in primary_pairs))
    primary_started=time.monotonic()
    run(['matches_importer', '--database_path', str(database), '--match_list_path', str(pairs), '--match_type', 'pairs', '--SiftMatching.use_gpu', '0', '--SiftMatching.num_threads', '4'])
    primary_match_seconds=time.monotonic()-primary_started
    def attempt_models(destination, label):
        run(['mapper', '--database_path', str(database), '--image_path', str(root / 'frames'), '--output_path', str(destination), '--Mapper.num_threads', '4'])
        summaries = []
        for model in sorted(p for p in destination.iterdir() if p.is_dir() and not p.is_symlink()):
            text = output / (label + '-text-' + model.name)
            text.mkdir(mode=0o700)
            run(['model_converter', '--input_path', str(model), '--output_path', str(text), '--output_type', 'TXT'])
            summary = summarize_model(text, [Path(frame['name']).name for frame in manifest['frames']])
            summaries.append({'model': label + '/' + model.name, **summary})
        # COLMAP can emit an early partial hypothesis followed by a complete
        # model of the same views. Retain the alternatives for private diagnosis,
        # but do not label their overlap as missing capture connectivity.
        (output / (label + '-model-candidates.json')).write_text(json.dumps(summaries, sort_keys=True))
        return select_complete_model(summaries, len(manifest['frames']))

    primary_map_started=time.monotonic()
    summaries = attempt_models(sparse, 'primary')
    primary_map_seconds=time.monotonic()-primary_map_started
    primary_passed = len(summaries) == 1 and summaries[0]['advisoryQualityPassed']
    fallback = {'attempted': False, 'reason': 'primary_advisory_passed' if primary_passed else 'deadline_budget_insufficient'}
    # Do not discard a useful recapture report by starting a fallback which
    # cannot fit the measured matching/mapping cost left in this same job.
    extra_pairs=[] if primary_passed else recovery_pairs(manifest['frames'],primary_pairs,summaries,image_root=root/'frames')
    estimated_recovery=primary_match_seconds*len(extra_pairs)/max(1,len(primary_pairs))*1.5+primary_map_seconds*1.5+60
    if extra_pairs and deadline - time.monotonic() >= max(60,estimated_recovery):
        # Exactly one broader match plan, under the original total deadline.
        broader = output / 'fallback-pairs.txt'
        broader.write_text(''.join(a + ' ' + b + '\n' for a,b in extra_pairs))
        run(['matches_importer', '--database_path', str(database), '--match_list_path', str(broader), '--match_type', 'pairs', '--SiftMatching.use_gpu', '0', '--SiftMatching.num_threads', '4'])
        fallback_sparse = output / 'fallback-sparse'
        fallback_sparse.mkdir(mode=0o700)
        alternatives = attempt_models(fallback_sparse, 'fallback')
        rank = lambda models: max((m['registeredCameraCount'] for m in models), default=0)
        selected = rank(alternatives) > rank(summaries) or (len(alternatives) == 1 and alternatives[0]['advisoryQualityPassed'])
        fallback = {'attempted': True, 'reason': 'bounded_broader_matches', 'models': alternatives, 'selected': selected}
        if selected:
            summaries = alternatives
    advisory_passed = len(summaries) == 1 and summaries[0]['advisoryQualityPassed']
    report = {'schemaVersion': 1, 'state': 'awaiting_review' if advisory_passed else 'awaiting_input', 'profile': profile['id'],
              'models': summaries, 'selectedFrameCount': len(manifest['frames']), 'matchingFallback': fallback,
              'cameraGroupAssignments': group_assignments,
              'nextAction': 'Review camera connectivity, missing rooms and privacy before further processing.' if advisory_passed else 'Recapture a continuous overlapping path through missing rooms and doorways; avoid blur and lens switches within a camera group.',
              'scale': None, 'geometricCoverage': None, 'privacyReviewRequired': True, 'publiclyServed': False,
              'nativeIsolationProfile': 'linux-landlock-seccomp-colmap-v1'}
    if prepare_training and advisory_passed and summaries[0]['registeredCameraCount'] >= 10:
        label, model_name = summaries[0]['model'].split('/')
        selected_model = output / ('sparse' if label == 'primary' else 'fallback-sparse') / model_name
        try:
            report['trainingInput'] = prepare_training_dataset(root, manifest, selected_model, output, run)
        except UnusableCalibrationError as error:
            # Connectivity/reprojection measurements remain valid, but an
            # unstable calibration must not emit a training archive. Return
            # the measured report for input review instead of losing it behind
            # a generic execution failure. Other validation errors still fail.
            report['nextAction'] = ('Some views produced unstable camera calibration. Exclude or replace those views and reconstruct cameras again. '
                                    'No training inputs were exported. ' + str(error))
    elif prepare_training and advisory_passed:
        report['nextAction'] = 'Camera connectivity needs review. Capture at least ten registered views with a continuous overlapping path before preparing held-out training inputs.'
    check_cancelled()
    cpu_model = 'unknown'
    try:
        cpu_model = next(line.split(':', 1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines()
                         if line.startswith('model name'))
    except (OSError, StopIteration):
        pass
    # Linux ru_maxrss is KiB and is a child-process high-water mark, not the
    # aggregate memory of concurrent processes or GPU/VRAM usage.
    report['measurements'] = {
        'basis': 'actual local CPU camera solve; includes input verification, process startup and optional training-input preparation; excludes container build/start and report write',
        'elapsedSeconds': seconds_since(started_ns), 'commands': command_measurements,
        'peakChildRssBytes': str(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss * 1024),
        'memoryBasis': 'Linux maximum RSS among completed children of this runner process; not aggregate or GPU memory',
        'inputManifestSha256': hashlib.sha256((root / 'manifest.json').read_bytes()).hexdigest(),
        'inputFrameBytes': str(sum((root / frame['name']).stat().st_size for frame in manifest['frames'])),
        'outputBytesBeforeReport': str(sum(path.stat().st_size for path in output.rglob('*') if path.is_file() and not path.is_symlink())),
        'runtimeProfileSha256': hashlib.sha256(Path('/opt/colmap/runtime-profile.json').read_bytes()).hexdigest(),
        'hardware': {'cpuModel': cpu_model, 'architecture': platform.machine(), 'kernel': platform.release(),
                     'execution': 'Docker Compose CPU profile', 'configuredThreads': 4},
        'gpuUsed': False, 'vramBytes': None, 'viewerFps': None,
    }
    (output / 'camera-solve-report.json').write_text(json.dumps(report, sort_keys=True))
    return report


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--max-seconds', type=int, default=240)
    parser.add_argument('--prepare-training', action='store_true')
    args = parser.parse_args()
    import threading
    stopped = threading.Event()
    previous = {sig: signal.signal(sig, lambda _sig, _frame: stopped.set()) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        report = solve(args.input, args.output, args.max_seconds, args.prepare_training, cancelled=stopped.is_set)
        if stopped.is_set():
            raise InterruptedError('Camera solve cancelled')
        print(json.dumps(report, sort_keys=True))
    except InterruptedError:
        print(json.dumps({'state': 'cancelled', 'publiclyServed': False}))
        raise SystemExit(130) from None
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
