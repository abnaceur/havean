"""Optional confined structured-enrichment port; disabled by default.

The admitted adapter must execute inside the same no-network/no-exec OCR sandbox.
This validator does not import a model, call a remote service or admit an adapter.
Unsupported model claims never become evidence or overwrite confirmed facts.
"""
import json
from .facts import generic_candidates
from .sources import SourceError


def enrich(lines, locale, *, enabled=False, adapter=None):
    base = generic_candidates(lines, locale, include_counts=True)
    if enabled is not True:
        return {'schemaVersion': 1, 'state': 'disabled', 'reviewRequired': True,
                'candidates': base, 'reason': 'Optional structured provider is disabled; generic extraction and manual review remain available'}
    if adapter is None or not callable(adapter):
        raise SourceError('STRUCTURED_PROVIDER_UNAVAILABLE')
    result = adapter({'schemaVersion': 1, 'locale': locale, 'lines': lines})
    if not isinstance(result, dict) or set(result) != {'schemaVersion', 'proposals'} or type(result['schemaVersion']) is not int or result['schemaVersion'] != 1 or not isinstance(result['proposals'], list) or len(result['proposals']) > 1000:
        raise SourceError('STRUCTURED_PROVIDER_RESULT_INVALID')
    # Evidence-free claims, commands, paths, actor/approval keys and changed
    # units/basis/numbers are rejected against independent anchored extraction.
    valid = {json.dumps(candidate, sort_keys=True, ensure_ascii=False, allow_nan=False) for candidate in base}
    seen = set()
    for proposal in result['proposals']:
        try:
            key = json.dumps(proposal, sort_keys=True, ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise SourceError('STRUCTURED_PROVIDER_RESULT_INVALID') from exc
        if key not in valid or key in seen:
            raise SourceError('STRUCTURED_PROVIDER_UNSUPPORTED_CLAIM')
        seen.add(key)
    return {'schemaVersion': 1, 'state': 'validated', 'reviewRequired': True,
            'candidates': base, 'supportedProposals': len(seen),
            'reason': 'Grounded suggestions only; independent fact review remains required'}
