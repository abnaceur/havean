"""One confined CUDA worker. Native wheels/extensions must be preinstalled."""
import argparse
import json
from pathlib import Path
from .decoder_isolation import enter_decoder_sandbox
from .gsplat_training import train, bounded_profile, EXECUTION_ITERATIONS, PROFILE_ID, QUALITY_PROFILE_ID


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--profile',choices=[PROFILE_ID,QUALITY_PROFILE_ID],default=QUALITY_PROFILE_ID)
    args = parser.parse_args()
    try:
        enter_decoder_sandbox(Path(args.output), training_inputs=Path(args.input))
        profile=bounded_profile(iterations=6000,max_seconds=1200,splat_cap=75000,max_edge=1024,checkpoint_interval=100,adaptive=True) if args.profile==QUALITY_PROFILE_ID else bounded_profile(iterations=EXECUTION_ITERATIONS,max_seconds=240)
        result = train(args.input,args.output,profile,investigation=True)
        print(json.dumps({'ok': True, 'result': result}, allow_nan=False))
    except Exception:
        # Source names, local paths, library diagnostics and keys are never returned.
        print(json.dumps({'ok': False, 'code': 'GPU_TRAINING_FAILED'}))
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
