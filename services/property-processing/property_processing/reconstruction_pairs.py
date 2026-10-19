"""Deterministic bounded match plans; pairs are hypotheses, never room links."""
from pathlib import Path
from PIL import Image


def camera_groups(frames):
    if not isinstance(frames, list) or not 3 <= len(frames) <= 600:
        raise ValueError('Bounded prepared frames required')
    groups = {}
    for frame in frames:
        room = frame.get('roomId')
        if room is not None and (not isinstance(room,str) or not 1 <= len(room) <= 100):
            raise ValueError('Bounded supplied room label required')
        group = frame.get('cameraGroupId')
        if not isinstance(group, str) or not 1 <= len(group) <= 100:
            raise ValueError('Explicit camera group required')
        entries = groups.setdefault(group, [])
        if entries and (frame['width'], frame['height']) != (entries[0]['width'], entries[0]['height']):
            raise ValueError('Resolution dimensions changes require a separate camera group')
        entries.append(frame)
    if len(groups) > 32:
        raise ValueError('Camera group budget exceeded')
    return groups


def matching_pairs(frames, broader=False, image_root=None):
    groups = camera_groups(frames)
    names = [Path(frame['name']).name for frame in frames]
    if len(set(names)) != len(names):
        raise ValueError('Distinct frame names required')
    indexes = {name: i for i, name in enumerate(names)}
    pairs = set()
    def compatible(a,b):
        first=(frames[a].get('roomId') or '').strip().casefold()
        second=(frames[b].get('roomId') or '').strip().casefold()
        return not first or not second or first==second
    def add(a, b):
        if a != b and compatible(a,b):
            pairs.add(tuple(sorted((a, b))))
    # Local temporal neighbors within each capture/calibration group.
    for entries in groups.values():
        sequence = [indexes[Path(frame['name']).name] for frame in entries]
        for i, a in enumerate(sequence):
            for b in sequence[i+1:i+(31 if broader else 11)]:
                add(a,b)
            # Bounded long-range candidates allow loops without claiming connectivity.
            for step in ([32,64,128,256] if broader else [32,128]):
                if i+step < len(sequence):add(a,sequence[i+step])
    # Uniform keyframes propose cross-clip links; geometry must verify every pair.
    samples=[]
    for entries in groups.values():
        positions=set()
        for requested in ([4,8] if broader else [4]):
            count=min(requested,len(entries))
            positions.update(round(i*(len(entries)-1)/(count-1)) if count>1 else 0 for i in range(count))
        samples.append(sorted({indexes[Path(entries[position]['name']).name] for position in positions}))
    for i, first in enumerate(samples):
        for second in samples[i+1:]:
            for a in first:
                for b in second:add(a,b)
    # Cheap appearance candidates complement uniform keyframes. Their geometry
    # still has to pass COLMAP matching; colour resemblance never joins rooms.
    if image_root is not None:
        thumbnails=[]
        for name in names:
            with Image.open(Path(image_root)/name) as image:
                thumbnails.append(tuple(image.convert('RGB').resize((8,6)).tobytes()))
        for i, pixels in enumerate(thumbnails):
            nearby=sorted((sum(abs(a-b) for a,b in zip(pixels,other)),j)
                          for j,other in enumerate(thumbnails)
                          if frames[i]['cameraGroupId'] != frames[j]['cameraGroupId'] and compatible(i,j))
            for _,j in nearby[:8 if not broader else 16]:add(i,j)
    if len(pairs)>40000:
        raise ValueError('Matching pair budget exceeded')
    return [(names[a],names[b]) for a,b in sorted(pairs)]


def recovery_pairs(frames, primary_pairs, models, image_root=None):
    """Spend the second pass on missing views; retain verified primary matches."""
    names={Path(frame['name']).name for frame in frames}
    largest=max(models,key=lambda model:model['registeredCameraCount'],default={})
    registered={pose['name'] for pose in largest.get('cameraPoses',{}).values()}
    missing=names-registered
    previous=set(primary_pairs)
    return [(a,b) for a,b in matching_pairs(frames,broader=True,image_root=image_root)
            if (a,b) not in previous and (not missing or a in missing or b in missing)]
