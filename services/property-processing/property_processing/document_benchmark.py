"""Offline benchmark command; never installs a model or enables a family."""
import argparse
import json
from pathlib import Path
from .document_profiles import FAMILIES, benchmark_family


def report_file(family, source, output):
    source, output = Path(source), Path(output)
    if source.is_symlink() or not source.is_file() or source.stat().st_size > 16 * 1024 * 1024:
        raise ValueError('Bounded regular authorized benchmark manifest required')
    if output.exists() or output.is_symlink():
        raise ValueError('New benchmark report path required')
    def invalid_constant(value):
        raise ValueError('Nonfinite benchmark input')
    examples = json.loads(source.read_text(), parse_constant=invalid_constant)
    report = benchmark_family(family, examples)
    # No document text, source paths or authorization contents in the receipt.
    with output.open('x') as stream:
        json.dump(report, stream, sort_keys=True, allow_nan=False)
        stream.write('\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--family', required=True, choices=sorted(FAMILIES))
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    print(json.dumps(report_file(args.family, args.manifest, args.report), sort_keys=True))
