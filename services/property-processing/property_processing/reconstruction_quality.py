"""Bounded COLMAP text diagnostics. No inferred room coverage or metric scale."""
import math
from pathlib import Path
import statistics


def select_complete_model(models, selected_count):
    """Discard redundant hypotheses only when one valid model covers every view.

    Partial models remain separate; this never merges disconnected coordinates.
    """
    complete = [model for model in models if model['advisoryQualityPassed']
                and model['registeredCameraCount'] == selected_count
                and not model['unregisteredFrames']
                and model['connectedComponentCount'] == 1]
    return complete if len(complete) == 1 else models


def _records(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('Bounded regular COLMAP text file required')
    return [line.strip() for line in path.read_text().splitlines() if not line.startswith('#')]


def _finite(values):
    result = [float(v) for v in values]
    if not all(math.isfinite(v) for v in result):
        raise ValueError('Finite reconstruction coordinates required')
    return result


def _distribution(values):
    if not values:
        return None
    ordered = sorted(values)
    return {'min': ordered[0], 'median': statistics.median(ordered),
            'p95': ordered[min(len(ordered)-1, math.ceil(len(ordered)*.95)-1)], 'max': ordered[-1]}


def summarize_model(directory, selected_names):
    directory = Path(directory)
    if not selected_names or len(selected_names) > 600 or len(set(selected_names)) != len(selected_names):
        raise ValueError('Distinct bounded selected frame names required')
    cameras = {}
    for line in _records(directory / 'cameras.txt'):
        if not line:
            continue
        words = line.split()
        if len(words) < 5 or words[0] in cameras or int(words[2]) < 1 or int(words[3]) < 1:
            raise ValueError('Invalid camera record')
        cameras[words[0]] = {'model': words[1], 'width': int(words[2]), 'height': int(words[3]), 'parameters': _finite(words[4:])}
    images = {}
    lines = _records(directory / 'images.txt')
    if len(lines) % 2:
        raise ValueError('Image poses require paired observation records')
    for index in range(0, len(lines), 2):
        words = lines[index].split()
        if len(words) != 10 or words[0] in images or words[8] not in cameras or words[9] not in selected_names:
            raise ValueError('Invalid registered frame identity')
        pose = _finite(words[1:8])
        if abs(sum(v*v for v in pose[:4])-1) > .001:
            raise ValueError('Normalized camera quaternion required')
        observations = lines[index+1].split()
        if len(observations) % 3:
            raise ValueError('Invalid image observations')
        _finite([observations[i] for i in range(len(observations)) if i % 3 != 2])
        points = [int(observations[i]) for i in range(2, len(observations), 3)]
        images[words[0]] = {'name': words[9], 'cameraId': words[8], 'worldToCameraQuaternion': pose[:4], 'worldToCameraTranslation': pose[4:], 'pointIds': points}
    if len({image['name'] for image in images.values()}) != len(images):
        raise ValueError('Duplicate registered frame')
    graph = {identity: set() for identity in images}
    errors, tracks, xyz, points = [], [], [], {}
    repeated_camera_observations = 0
    for line in _records(directory / 'points3D.txt'):
        if not line:
            continue
        words = line.split()
        if len(words) < 8 or (len(words)-8) % 2 or words[0] in points:
            raise ValueError('Invalid sparse point record')
        position = _finite(words[1:4]); error = _finite([words[7]])[0]
        if error < 0 or any(not 0 <= int(v) <= 255 for v in words[4:7]):
            raise ValueError('Invalid point colour or reprojection error')
        links = []
        observations_seen = set()
        for i in range(8, len(words), 2):
            identity, observation = words[i], int(words[i+1])
            if identity not in images or not 0 <= observation < len(images[identity]['pointIds']) or images[identity]['pointIds'][observation] != int(words[0]) or (identity, observation) in observations_seen:
                raise ValueError('Sparse track must match registered observations')
            observations_seen.add((identity, observation))
            links.append(identity)
        repeated_camera_observations += len(links) - len(set(links))
        links = sorted(set(links))
        if len(links) < 2:
            raise ValueError('Sparse points require at least two observations')
        # Star edges preserve connectivity without quadratic expansion of long tracks.
        for identity in links[1:]:
            graph[links[0]].add(identity); graph[identity].add(links[0])
        points[words[0]] = True
        xyz.append(position); errors.append(error); tracks.append(len(links))
        if len(points) > 1000000:
            raise ValueError('Sparse point budget exceeded')
    for image in images.values():
        if any(point != -1 and str(point) not in points for point in image['pointIds']):
            raise ValueError('Registered observation references absent sparse point')
    components, unseen = [], set(graph)
    while unseen:
        root = min(unseen); stack = [root]; unseen.remove(root); component = []
        while stack:
            identity = stack.pop(); component.append(images[identity]['name'])
            for neighbor in graph[identity]:
                if neighbor in unseen:
                    unseen.remove(neighbor); stack.append(neighbor)
        components.append(sorted(component))
    ratio = len(images)/len(selected_names)
    errors_report = _distribution(errors)
    acceptable = ratio >= .7 and len(components) == 1 and errors_report is not None and errors_report['median'] < 2
    return {'registeredCameraCount': len(images), 'selectedFrameCount': len(selected_names), 'registrationRatio': ratio,
            'unregisteredFrames': sorted(set(selected_names)-{v['name'] for v in images.values()}),
            'cameraCalibrationGroups': cameras, 'cameraPoses': {key:{**{k:v for k,v in image.items() if k!='pointIds'},'observationCount':len(image['pointIds'])} for key,image in images.items()}, 'pointCount': len(points),
            'connectedComponents': components, 'connectedComponentCount': len(components),
            'reprojectionErrorPixels': errors_report, 'trackLength': _distribution(tracks),
            'repeatedCameraObservations': repeated_camera_observations,
            'bounds': None if not xyz else {'min': [min(p[i] for p in xyz) for i in range(3)], 'max': [max(p[i] for p in xyz) for i in range(3)]},
            'scale': None, 'unit': 'arbitrary', 'geometricCoverage': None, 'requiredRoomConnectivity': None,
            'advisoryQualityPassed': acceptable, 'humanRoomReviewRequired': True,
            'recommendation': 'review_connectivity_and_coverage' if acceptable else 'recapture_or_bounded_matching_fallback',
            'publiclyServed': False}
