"""Private bounded gsplat training investigation.

No production profile is admitted here. Real CUDA is required: no simulated
training or CPU-success substitute. Checkpoints include optimizer and RNG state.
"""
import hashlib
import importlib.metadata
import io
import json
import math
import os
from pathlib import Path
import signal
import stat
import struct
import time

from .splat_export import export_private_tiers, SH_C0
from .training_data import load_training_dataset

VERSIONS = {'torch': '2.7.1+cu126', 'gsplat': '1.5.3', 'cuda': '12.6'}
SOURCE_COMMIT = '937e29912570c372bed6747a5c9bf85fed877bae'
PROFILE_ID = 'gsplat-1.5.3-cu126-fixed-density-investigation-v1'
QUALITY_PROFILE_ID = 'gsplat-1.5.3-cu126-adaptive-investigation-v2'
# The durable agent job needs more than the short checkpoint smoke run to fit
# a furnished interior. Preserve the existing 240-second execution ceiling.
EXECUTION_ITERATIONS = 3000


def bounded_profile(*, iterations=500, max_seconds=300, splat_cap=30000, max_edge=640, checkpoint_interval=25, adaptive=False):
    values = {'iterations': iterations, 'maxSeconds': max_seconds, 'splatCap': splat_cap, 'maxEdge': max_edge, 'checkpointInterval': checkpoint_interval}
    bounds = {'iterations': (1, 10000), 'maxSeconds': (1, 3600), 'splatCap': (16, 100000), 'maxEdge': (64, 1024), 'checkpointInterval': (1, 100)}
    if any(type(value) is not int or not bounds[key][0] <= value <= bounds[key][1] for key, value in values.items()):
        raise ValueError('Bounded integer training profile required')
    return {'id': QUALITY_PROFILE_ID if adaptive else PROFILE_ID, **values, 'sphericalHarmonicDegree': 0, 'densification': 'gradient' if adaptive else False,
            'initialization': 'nearest-three-points-v1',
            **({'optimization':'shuffled-decay-ssim-v1'} if adaptive else {}),
            'maxOomFallbacks': 1, 'versions': dict(VERSIONS), 'gsplatSourceCommit': SOURCE_COMMIT}


def _json_atomic(path, value):
    temporary = path.with_suffix('.writing')
    with temporary.open('w') as handle:
        json.dump(value, handle, allow_nan=False, indent=2)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    temporary.chmod(0o600)
    temporary.replace(path)


def _load_checkpoint(torch, output, dataset, profile):
    pointer = output / 'checkpoint.json'
    if pointer.is_symlink() or not pointer.is_file() or pointer.stat().st_size > 16384:
        raise ValueError('Bounded private checkpoint pointer required')
    metadata = json.loads(pointer.read_text())
    if metadata.get('schemaVersion') != 1 or metadata.get('datasetFingerprint') != dataset['fingerprint'] or metadata.get('profile') != profile or not isinstance(metadata.get('step'), int):
        raise ValueError('Checkpoint dataset, profile or schema mismatch')
    name = metadata.get('file')
    if not isinstance(name, str) or name != f"checkpoint-{metadata['step']:06d}.pt":
        raise ValueError('Canonical checkpoint identity required')
    fd = os.open(output / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= 128 * 1024**2:
            raise ValueError('Bounded regular checkpoint required')
        if hashlib.file_digest(handle, 'sha256').hexdigest() != metadata.get('sha256'):
            raise ValueError('Checkpoint checksum mismatch')
        handle.seek(0)
        state = torch.load(handle, map_location='cpu', weights_only=True)
    if state.get('datasetFingerprint') != dataset['fingerprint'] or state.get('profile') != profile or state.get('step') != metadata['step']:
        raise ValueError('Checkpoint content lineage mismatch')
    if type(state.get('step')) is not int or not 0 <= state['step'] <= profile['iterations'] or type(state.get('fallbacks')) is not int or state['fallbacks'] not in (0, 1) or not isinstance(state.get('elapsedSeconds'), (int, float)) or not math.isfinite(state['elapsedSeconds']) or not 0 <= state['elapsedSeconds'] <= profile['maxSeconds'] + 30:
        raise ValueError('Checkpoint budget state invalid')
    return state


def train(directory, output, profile, *, resume=False, investigation=False):
    if not investigation:
        raise ValueError('GPU_PROFILE_NOT_ADMITTED')
    expected = bounded_profile(iterations=profile.get('iterations'), max_seconds=profile.get('maxSeconds'), splat_cap=profile.get('splatCap'), max_edge=profile.get('maxEdge'), checkpoint_interval=profile.get('checkpointInterval'),adaptive=profile.get('densification')=='gradient')
    if profile != expected:
        raise ValueError('Canonical bounded investigation profile required')
    started = time.monotonic()
    dataset = load_training_dataset(directory)
    output = Path(output)
    if output.is_symlink() or output.parent.is_symlink():
        raise ValueError('Regular private checkpoint directory required')
    if resume:
        import torch
        if not output.is_dir():
            raise ValueError('Existing private checkpoint directory required')
        saved = _load_checkpoint(torch, output, dataset, profile)
        from .training_exports import reset_interrupted_export
        reset_interrupted_export(output)
    else:
        if output.exists():
            # The parent reserves cumulative time before the CUDA child starts.
            # Never overwrite earlier checkpoints or scene outputs on a new run.
            if not output.is_dir() or {item.name for item in output.iterdir()} != {'.training.lock', 'training-budget.json'}:
                raise ValueError('New supervised private training directory required')
        else:
            output.mkdir(mode=0o700)
        saved = None
    # Exact versions alone do not establish native redistribution admission.
    import torch
    if torch.__version__ != VERSIONS['torch'] or torch.version.cuda != VERSIONS['cuda'] or importlib.metadata.version('gsplat') != VERSIONS['gsplat']:
        raise ValueError('Pinned torch/CUDA/gsplat investigation runtime required')
    if not torch.cuda.is_available():
        raise ValueError('GPU_RUNTIME_UNAVAILABLE')
    import gsplat
    if hashlib.sha256((Path(gsplat.__file__).parent / 'rendering.py').read_bytes()).hexdigest() != '6b5e4101035031afbb26bed7e496382c7502f9d8bc7cc9a432f290674a4d9133':
        raise ValueError('Pinned gsplat rendering source required')
    from gsplat import rasterization
    from PIL import Image
    stopped = False
    def stop(_number, _frame):
        nonlocal stopped
        stopped = True
    elapsed_before = saved['elapsedSeconds'] if saved else 0
    fallbacks = saved['fallbacks'] if saved else 0
    effective_edge = max(64, profile['maxEdge'] // (2 ** fallbacks))
    step = saved['step'] if saved else 0
    torch.manual_seed(20261010)
    torch.cuda.manual_seed_all(20261010)
    if saved:
        torch.set_rng_state(saved['cpuRng'])
        torch.cuda.set_rng_state_all(saved['cudaRng'])
    count = min(len(dataset['points']), profile['splatCap'])
    if saved:
        initial = saved['parameters']
    else:
        selected = [i * len(dataset['points']) // count for i in range(count)]
        points = torch.tensor([dataset['points'][i] for i in selected], dtype=torch.float32)
        colours = torch.tensor([dataset['colours'][i] for i in selected], dtype=torch.float32)
        # Follow the pinned reference trainer's local three-neighbour scale.
        # A global bounding-box radius makes sparse interior details blur together.
        # Chunk distances so the maximum matrix is 256 x splatCap, not N x N.
        device_points = points.to('cuda')
        radii = []
        with torch.no_grad():
            for start in range(0, count, 256):
                distances = torch.cdist(device_points[start:start + 256], device_points)
                local = torch.arange(len(distances), device='cuda')
                distances[local, local + start] = float('inf')
                nearest = distances.topk(3, largest=False).values
                radii.append(nearest.square().mean(1).sqrt().clamp(1e-5, 1e4).cpu())
        log_scales = torch.cat(radii).log().unsqueeze(1).repeat(1, 3)
        del device_points, distances, nearest, radii
        initial = {'means': points, 'quats': torch.rand((count,4),dtype=torch.float32) if profile['densification']=='gradient' else torch.tensor([[1, 0, 0, 0]] * count, dtype=torch.float32),
                   'logScales': log_scales, 'opacityLogits': torch.full((count,), math.log(.1 / .9)),
                   'sh0': ((colours - .5) / SH_C0).unsqueeze(1)}
    shapes = {'means': (3,), 'quats': (4,), 'logScales': (3,), 'opacityLogits': (), 'sh0': (1, 3)}
    count = initial['means'].shape[0]
    if set(initial) != set(shapes) or not 16 <= count <= profile['splatCap'] or any(not isinstance(value, torch.Tensor) or value.dtype != torch.float32 or tuple(value.shape) != (count,) + shapes[name] or not torch.isfinite(value).all().item() for name, value in initial.items()):
        raise ValueError('Finite bounded checkpoint parameter shapes required')
    if (initial['quats'].norm(dim=1) < 1e-8).any().item() or (initial['means'].abs() > 1e6).any().item():
        raise ValueError('Bounded positions and nonzero rotations required')
    if saved:
        for state in ([state for entry in saved['optimizer']['perParameter'].values() for state in entry['state'].values()] if 'perParameter' in saved['optimizer'] else saved['optimizer']['state'].values()):
            for value in state.values():
                if isinstance(value, torch.Tensor) and (value.numel() > count * 4 or not torch.isfinite(value).all().item()):
                    raise ValueError('Finite bounded optimizer checkpoint required')
    parameters = {name: torch.nn.Parameter(value.to('cuda')) for name, value in initial.items()}
    rates = {'means': .001, 'quats': .001, 'logScales': .005, 'opacityLogits': .05, 'sh0': .0025}
    adaptive = profile['densification'] == 'gradient'
    class OptimizerSet:
        def __init__(self, values):
            self.optimizers = {name: torch.optim.Adam([value], lr=rates[name], eps=1e-8) for name, value in values.items()}
        def zero_grad(self, **kwargs):
            for optimizer in self.optimizers.values(): optimizer.zero_grad(**kwargs)
        def step(self):
            for optimizer in self.optimizers.values(): optimizer.step()
        def state_dict(self): return {'perParameter': {name: optimizer.state_dict() for name, optimizer in self.optimizers.items()}}
        def load_state_dict(self, state):
            for name, optimizer in self.optimizers.items(): optimizer.load_state_dict(state['perParameter'][name])
    optimizer = OptimizerSet(parameters) if adaptive else torch.optim.Adam([{'params': [value], 'lr': rates[name]} for name, value in parameters.items()])
    if adaptive:
        from gsplat.strategy import DefaultStrategy
        from gsplat.strategy.ops import remove
        scene_scale=float(torch.quantile((parameters['means']-parameters['means'].median(0).values).norm(dim=1),.9).clamp_min(.01).item())
        strategy = DefaultStrategy(refine_start_iter=300, refine_stop_iter=min(4500,max(650,profile['iterations']-500)), refine_every=100, reset_every=3000)
        strategy_state = strategy.initialize_state(scene_scale=scene_scale)
        aliases = {'means': 'means', 'quats': 'quats', 'scales': 'logScales', 'opacities': 'opacityLogits', 'sh0': 'sh0'}
        strategy.check_sanity({alias: parameters[name] for alias, name in aliases.items()}, {alias: optimizer.optimizers[name] for alias, name in aliases.items()})
    if saved:
        optimizer.load_state_dict(saved['optimizer'])
        if adaptive and saved.get('strategyState'): strategy_state={key:value.to('cuda') if isinstance(value,torch.Tensor) else value for key,value in saved['strategyState'].items()}
    def elapsed():
        return elapsed_before + time.monotonic() - started
    def checkpoint():
        state = {'datasetFingerprint': dataset['fingerprint'], 'profile': profile, 'step': step, 'fallbacks': fallbacks,
                 'elapsedSeconds': elapsed(), 'parameters': {name: value.detach().cpu() for name, value in parameters.items()},
                 'optimizer': optimizer.state_dict(), 'strategyState': {key:value.detach().cpu() if isinstance(value,torch.Tensor) else value for key,value in strategy_state.items()} if adaptive else None, 'cpuRng': torch.get_rng_state(), 'cudaRng': torch.cuda.get_rng_state_all()}
        name = f'checkpoint-{step:06d}.pt'
        destination = output / name
        temporary = output / 'checkpoint.writing'
        with temporary.open('wb') as handle:
            torch.save(state, handle)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(0o600)
        temporary.replace(destination)
        with destination.open('rb') as handle:
            digest = hashlib.file_digest(handle, 'sha256').hexdigest()
        _json_atomic(output / 'checkpoint.json', {'schemaVersion': 1, 'file': name, 'sha256': digest, 'step': step,
                     'datasetFingerprint': dataset['fingerprint'], 'profile': profile, 'elapsedSeconds': state['elapsedSeconds'], 'publiclyServed': False})
        # Retain the current and immediately preceding durable checkpoint only.
        old = sorted(output.glob('checkpoint-*.pt'))
        for path in old[:-2]:
            path.unlink()
    def view(index):
        v = dataset['views'][index]
        fd = os.open(v['path'], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                raise ValueError('Regular private training image required')
            body = handle.read(16 * 1024**2 + 1)
        if len(body) > 16 * 1024**2 or hashlib.sha256(body).hexdigest() != v['sha256']:
            raise ValueError('Training source changed after preparation')
        with Image.open(io.BytesIO(body)) as image:
            image.load()
            ratio = min(1, effective_edge / max(v['width'], v['height']))
            width, height = max(1, round(v['width'] * ratio)), max(1, round(v['height'] * ratio))
            rgb = image.convert('RGB').resize((width, height))
            target = torch.frombuffer(bytearray(rgb.tobytes()), dtype=torch.uint8).reshape(height, width, 3).to('cuda').float() / 255
        intrinsics = torch.tensor(v['K'], device='cuda', dtype=torch.float32)
        intrinsics[0] *= width / v['width']
        intrinsics[1] *= height / v['height']
        return target, torch.tensor(v['viewmat'], device='cuda', dtype=torch.float32).unsqueeze(0), intrinsics.unsqueeze(0), width, height
    def render(viewmat, intrinsics, width, height, with_info=False):
        result = rasterization(means=parameters['means'], quats=parameters['quats'], scales=parameters['logScales'].exp(),
                             opacities=parameters['opacityLogits'].sigmoid(), colors=parameters['sh0'], viewmats=viewmat, Ks=intrinsics,
                             width=width, height=height, sh_degree=0, packed=True, near_plane=.001, far_plane=1e6)
        return (result[0][0],result[2]) if with_info else result[0][0]
    # Match the reference trainer's shuffled sampling, position-rate decay and
    # local structure loss while retaining this investigation's bounded density.
    # https://github.com/nerfstudio-project/gsplat/blob/937e29912570c372bed6747a5c9bf85fed877bae/examples/simple_trainer.py
    epoch=-1
    order=[]
    if adaptive:
        coordinate=torch.arange(-5,6,device='cuda',dtype=torch.float32)
        kernel=torch.exp(-coordinate.square()/(2*1.5**2));kernel/=kernel.sum()
        ssim_window=(kernel[:,None]*kernel[None,:]).expand(3,1,11,11).contiguous()
    def structure_loss(rendered,target):
        x=rendered.permute(2,0,1).unsqueeze(0);y=target.permute(2,0,1).unsqueeze(0)
        moments=torch.nn.functional.conv2d(torch.cat([x,y,x*x,y*y,x*y]),ssim_window,groups=3)
        mx,my,xx,yy,xy=moments.unbind(0)
        vx=(xx-mx.square()).clamp_min(0);vy=(yy-my.square()).clamp_min(0);cov=xy-mx*my
        similarity=((2*mx*my+.01**2)*(2*cov+.03**2))/((mx.square()+my.square()+.01**2)*(vx+vy+.03**2))
        return 1-similarity.clamp(-1,1).mean()
    previous_signals = {number: signal.signal(number, stop) for number in (signal.SIGTERM, signal.SIGINT)}
    try:
        if not resume:
            checkpoint()
        while step < profile['iterations'] and not stopped and elapsed() < profile['maxSeconds']:
            try:
                optimizer.zero_grad(set_to_none=True)
                training_views=dataset['split']['training']
                if adaptive:
                    current_epoch=step//len(training_views)
                    if current_epoch!=epoch:
                        epoch=current_epoch
                        order=torch.randperm(len(training_views),generator=torch.Generator().manual_seed(20261010+epoch)).tolist()
                    index=training_views[order[step%len(training_views)]]
                    for group in optimizer.optimizers['means'].param_groups:group['lr']=rates['means']*.01**(step/profile['iterations'])
                else:index=training_views[step%len(training_views)]
                target, matrix, intrinsics, width, height = view(index)
                rendered, info = render(matrix, intrinsics, width, height, with_info=True)
                if adaptive: strategy.step_pre_backward({alias:parameters[name] for alias,name in aliases.items()},{alias:optimizer.optimizers[name] for alias,name in aliases.items()},strategy_state,step+1,info)
                loss = (rendered - target).abs().mean()
                if adaptive:loss=.8*loss+.2*structure_loss(rendered,target)
                if not torch.isfinite(loss).item():
                    raise ValueError('Nonfinite training loss')
                loss.backward()
                if any(value.grad is not None and not torch.isfinite(value.grad).all().item() for value in parameters.values()):
                    raise ValueError('Nonfinite training gradient')
                optimizer.step()
                if adaptive:
                    strategy_params = {alias: parameters[name] for alias, name in aliases.items()}
                    strategy_optimizers = {alias: optimizer.optimizers[name] for alias, name in aliases.items()}
                    strategy.step_post_backward(strategy_params, strategy_optimizers, strategy_state, step+1, info, packed=True)
                    if len(strategy_params['means']) > profile['splatCap']:
                        keep = strategy_params['opacities'].detach().sigmoid().topk(profile['splatCap']).indices
                        mask = torch.ones(len(strategy_params['means']),dtype=torch.bool,device='cuda');mask[keep]=False
                        remove(strategy_params,strategy_optimizers,strategy_state,mask)
                    parameters.update({name: strategy_params[alias] for alias, name in aliases.items()})
                    count = parameters['means'].shape[0]
                    if not 16 <= count <= profile['splatCap']: raise ValueError('Adaptive splat budget exceeded')
                with torch.no_grad():
                    parameters['logScales'].clamp_(-30, 12)
                    parameters['opacityLogits'].clamp_(-80, 80)
                step += 1
                if step % profile['checkpointInterval'] == 0:
                    checkpoint()
            except torch.cuda.OutOfMemoryError:
                if fallbacks or stopped or elapsed() >= profile['maxSeconds']:
                    raise
                # Restore the last durable optimizer/parameters, then apply one
                # bounded lower-resolution fallback. No unbounded retry loop.
                restored = _load_checkpoint(torch, output, dataset, profile)
                step = restored['step']
                optimizer.zero_grad(set_to_none=True)
                loss = rendered = target = matrix = intrinsics = None
                if adaptive:
                    optimizer = None
                    parameters.clear()
                    torch.cuda.empty_cache()
                    parameters = {name: torch.nn.Parameter(value.to('cuda')) for name, value in restored['parameters'].items()}
                    optimizer = OptimizerSet(parameters)
                    count = parameters['means'].shape[0]
                    strategy_state = {key:value.to('cuda') if isinstance(value,torch.Tensor) else value for key,value in restored['strategyState'].items()} if restored.get('strategyState') else strategy.initialize_state(scene_scale=scene_scale)
                else:
                    optimizer.state.clear()
                    torch.cuda.empty_cache()
                    for name, value in parameters.items(): value.data.copy_(restored['parameters'][name].to('cuda'))
                optimizer.load_state_dict(restored['optimizer'])
                torch.set_rng_state(restored['cpuRng'])
                torch.cuda.set_rng_state_all(restored['cudaRng'])
                fallbacks = 1
                effective_edge = max(64, profile['maxEdge'] // 2)
                torch.cuda.empty_cache()
                checkpoint()
        checkpoint()
        if stopped or step < profile['iterations'] or elapsed() >= profile['maxSeconds']:
            result = {'state': 'cancelled' if stopped else 'time_cap_reached', 'iterations': step, 'elapsedSeconds': elapsed(), 'fallbacks': fallbacks, 'publiclyServed': False}
            _json_atomic(output / 'training-report.json', result)
            return result
        metrics = []
        with torch.no_grad():
            for index in dataset['split']['heldOut']:
                if stopped or elapsed() >= profile['maxSeconds']:
                    raise TimeoutError('Held-out evaluation exceeded original training budget')
                target, matrix, intrinsics, width, height = view(index)
                rendered = render(matrix, intrinsics, width, height)
                if not torch.isfinite(rendered).all().item():
                    raise ValueError('Nonfinite held-out render')
                mse = ((rendered - target) ** 2).mean().item()
                metrics.append({'frame': dataset['views'][index]['name'], 'meanSquaredError': mse, 'psnrDb': None if mse == 0 else -10 * math.log10(mse), 'width': width, 'height': height})
                pixels = (rendered.clamp(0, 1) * 255).round().to(torch.uint8).cpu().contiguous()
                Image.frombytes('RGB', (width, height), bytes(pixels.flatten().tolist())).save(output / f'held-out-{index:03d}.png')
        destination = output / 'scene.ply'
        names = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
        arrays = {name: value.detach().cpu().tolist() for name, value in parameters.items()}
        with destination.open('xb') as handle:
            handle.write(('ply\nformat binary_little_endian 1.0\nelement vertex ' + str(count) + '\n' + ''.join('property float ' + name + '\n' for name in names) + 'end_header\n').encode())
            for index in range(count):
                handle.write(struct.pack('<14f', *arrays['means'][index], *arrays['sh0'][index][0], arrays['opacityLogits'][index], *arrays['logScales'][index], *arrays['quats'][index]))
        exported = export_private_tiers(destination, output / 'viewer-tiers')
        result = {'schemaVersion': 1, 'state': 'awaiting_review', 'iterations': step, 'elapsedSeconds': elapsed(), 'fallbacks': fallbacks,
                  'datasetFingerprint': dataset['fingerprint'], 'split': dataset['split'], 'heldOutMetrics': metrics, 'splatCount': count,
                  'export': exported, 'scale': None, 'roomCoverage': None, 'humanRenderReviewRequired': True, 'publiclyServed': False,
                  'limitations': [('Bounded adaptive density; no completeness certification.' if adaptive else 'Fixed sparse-point density; no densification or completeness certification.'), 'Temporal holdout excludes immediate neighbours but geometric independence is unverified.']}
        _json_atomic(output / 'training-report.json', result)
        return result
    finally:
        for number, handler in previous_signals.items():
            signal.signal(number, handler)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--iterations', type=int, default=500)
    parser.add_argument('--max-seconds', type=int, default=300)
    parser.add_argument('--splat-cap', type=int, default=30000)
    parser.add_argument('--max-edge', type=int, default=640)
    parser.add_argument('--checkpoint-interval', type=int, default=25)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--archive-sha256', help='Required checksum when --input is a calibrated training tar')
    parser.add_argument('--dataset-fingerprint', help='Expected calibrated dataset fingerprint from camera processing')
    parser.add_argument('--investigation', action='store_true')
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    selected_profile = bounded_profile(iterations=args.iterations, max_seconds=args.max_seconds, splat_cap=args.splat_cap, max_edge=args.max_edge, checkpoint_interval=args.checkpoint_interval)
    if args.worker:
        result = train(args.input, args.output, selected_profile, resume=args.resume, investigation=args.investigation)
    else:
        from .training_supervision import launch
        result = launch(args.input, args.output, selected_profile, resume=args.resume, investigation=args.investigation,
                        archive_sha256=args.archive_sha256, dataset_fingerprint=args.dataset_fingerprint)
    print(json.dumps(result, allow_nan=False))
    if not args.worker and result['exitCode'] not in (0, None):
        raise SystemExit(result['exitCode'] if result['exitCode'] > 0 else 1)
