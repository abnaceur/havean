"""Versioned, disabled country-family preparation and honest benchmark reports.

This module grants no runtime admission. It consumes already source-linked native
or OCR lines; strings never become commands or a source of property defaults.
"""
import hashlib
import json
import re
from decimal import Decimal
from .facts import generic_candidates, normalize_identifier, normalize_date, UNKNOWN_TEXT
from .sources import SourceError

FAMILIES = {
    'uae_deed_v1': {'country': 'AE', 'locales': ['ar', 'en'], 'enabled': False,
                    'reason': 'Representative independent authorized benchmark and distribution admission required'},
    'algerian_deed_v1': {'country': 'DZ', 'locales': ['ar', 'fr'], 'enabled': False,
                         'reason': 'Representative independent authorized benchmark and distribution admission required'},
    'algerian_booklet_v1': {'country': 'DZ', 'locales': ['ar', 'fr'], 'enabled': False,
                            'reason': 'Representative independent authorized benchmark and distribution admission required'},
}
IDENTIFIERS = {
    'plotId': r'(?:plot (?:number|id)|numéro de parcelle|رقم القطعة)',
    'buildingId': r'(?:building (?:number|id)|numéro du bâtiment|رقم المبنى)',
    'floorId': r'(?:floor (?:number|id)|numéro de l.étage|رقم الطابق)',
    'registryId': r'(?:registry (?:number|id)|numéro du registre|رقم السجل)',
    'ownerId': r'(?:owner (?:number|id)|identifiant du propriétaire|رقم المالك)',
}
TEXT_FIELDS = {
    'address': r'(?:address|adresse|العنوان)',
    'district': r'(?:district|quartier|الحي)',
    'city': r'(?:city|ville|المدينة)',
    'region': r'(?:emirate|wilaya|émirat|ولاية|إمارة)',
    'ownerName': r'(?:owner name|nom du propriétaire|اسم المالك)',
    'tenure': r'(?:tenure|type de tenure|نوع الحيازة)',
    'propertyType': r'(?:property type|type de bien|نوع العقار)',
    'boundary': r'(?:boundary|limites|الحدود)',
}


def family_candidates(lines, locale, family):
    definition = FAMILIES.get(family)
    if not definition or locale not in definition['locales']:
        raise SourceError('DOCUMENT_FAMILY_UNSUPPORTED')
    # Also validates all source boxes/pages and applies conservative quantities.
    candidates = generic_candidates(lines, locale, include_counts=True)
    for line in lines:
        text = line['text']
        evidence = {'page': line['page'], 'bbox': line['bbox'].copy(),
                    'coordinateSpace': 'upright-page-normalized-top-left', 'quotedText': text}
        extracted = []
        for field, label in IDENTIFIERS.items():
            match = re.fullmatch(r'\s*' + label + r'\s*[:：]\s*([\w/-]{1,200})\s*', text, re.I)
            if match and normalize_identifier(match[1]).casefold() not in UNKNOWN_TEXT:
                extracted.append((field, normalize_identifier(match[1])))
        for field, label in TEXT_FIELDS.items():
            match = re.fullmatch(r'\s*' + label + r'\s*[:：]\s*(.{1,500})\s*', text, re.I)
            if match and match[1].strip() and match[1].strip().casefold() not in UNKNOWN_TEXT:
                extracted.append((field, match[1].strip()))
        match = re.fullmatch(r'\s*(?:document date|date du document|تاريخ الوثيقة)\s*[:：]\s*([0-9٠-٩۰-۹-]{4,10})\s*(gregorian|hijri|unknown)\s*', text, re.I)
        if match:
            try:
                extracted.append(('documentDate', normalize_date(match[1], match[2].lower())))
            except SourceError:
                pass
        for field, value in extracted:
            candidates.append({'field': field, 'rawText': text, 'normalizedValue': value,
                               'origin': 'document', 'extractionScore': None,
                               'scoreMethod': family + '-uncalibrated', 'evidence': [evidence],
                               'extractorVersion': family})
    # A family label is not evidence that a property is in that country.
    return {'schemaVersion': 1, 'family': family, 'enabled': False,
            'reviewRequired': True, 'candidates': candidates}


def value_key(value):
    """Numerically equal decimal quantities compare without binary float."""
    if isinstance(value, dict) and 'amount' in value:
        if not isinstance(value['amount'], str) or not re.fullmatch(r'\d{1,13}(?:\.\d{1,8})?', value['amount']):
            raise SourceError('BENCHMARK_VALUE_INVALID')
        value = {**value, 'amount': format(Decimal(value['amount']).normalize(), 'f')}
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)


def benchmark_family(family, examples):
    if family not in FAMILIES or not isinstance(examples, list) or not examples or len(examples) > 1000:
        raise SourceError('BENCHMARK_INPUT_INVALID')
    ids, sources, independent_ids, categories = set(), set(), set(), set()
    correct = expected_count = numeric_correct = numeric_count = evidence_correct = predicted_count = absent_count = abstained = 0
    all_authorized_independent = True
    for example in examples:
        if not isinstance(example, dict) or set(example) != {'id', 'independentDocumentId', 'sourceSha256', 'authorizationReference', 'representative', 'authored', 'locale', 'category', 'lines', 'expected', 'absentFields'}:
            raise SourceError('BENCHMARK_INPUT_INVALID')
        identity, digest = example['id'], example['sourceSha256']
        if not isinstance(identity, str) or not identity or identity in ids or not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest) or digest in sources:
            raise SourceError('BENCHMARK_DUPLICATE_SOURCE')
        ids.add(identity); sources.add(digest)
        independent = example['independentDocumentId']
        if not isinstance(independent, str) or not independent:
            raise SourceError('BENCHMARK_INPUT_INVALID')
        independent_ids.add(independent)
        category = example['category']
        if not isinstance(category, list) or not category or any(c not in ['native', 'scanned', 'rotated', 'blurred', 'multipage', 'mixed_language'] for c in category):
            raise SourceError('BENCHMARK_INPUT_INVALID')
        categories.update(category)
        if any(type(example[k]) is not bool for k in ['representative', 'authored']):
            raise SourceError('BENCHMARK_INPUT_INVALID')
        if not isinstance(example['authorizationReference'], str) or not example['authorizationReference']:
            raise SourceError('BENCHMARK_AUTHORIZATION_REQUIRED')
        all_authorized_independent &= example['representative'] and not example['authored']
        predicted = family_candidates(example['lines'], example['locale'], family)['candidates']
        expected, absent = example['expected'], example['absentFields']
        if not isinstance(expected, list) or not isinstance(absent, list) or len(expected) > 200 or len(absent) > 50:
            raise SourceError('BENCHMARK_INPUT_INVALID')
        for item in expected:
            if not isinstance(item, dict) or set(item) != {'field', 'value', 'page', 'bbox', 'quotedText'}:
                raise SourceError('BENCHMARK_INPUT_INVALID')
            # Ground truth must independently identify actual original source evidence.
            if not any(line['page'] == item['page'] and line['bbox'] == item['bbox'] and line['text'] == item['quotedText'] for line in example['lines']):
                raise SourceError('BENCHMARK_GROUND_TRUTH_SOURCE_INVALID')
            expected_count += 1
            matching = [p for p in predicted if p['field'] == item['field'] and p['evidence'][0]['page'] == item['page'] and p['evidence'][0]['bbox'] == item['bbox']]
            hit = len(matching) == 1 and value_key(matching[0]['normalizedValue']) == value_key(item['value'])
            correct += int(hit)
            if isinstance(item['value'], dict) and 'amount' in item['value']:
                numeric_count += 1; numeric_correct += int(hit)
        for proposal in predicted:
            predicted_count += 1
            e = proposal['evidence'][0]
            evidence_correct += int(any(line['page'] == e['page'] and line['bbox'] == e['bbox'] and line['text'] == e['quotedText'] for line in example['lines']))
        for field in absent:
            if not isinstance(field, str):
                raise SourceError('BENCHMARK_INPUT_INVALID')
            absent_count += 1; abstained += int(not any(p['field'] == field for p in predicted))
    ratio = lambda n, d: None if not d else format(Decimal(n) / Decimal(d), '.8f')
    coverage = {'native', 'scanned', 'rotated', 'blurred', 'multipage', 'mixed_language'} <= categories
    eligible = all_authorized_independent and len(independent_ids) >= 10 and coverage and expected_count > 0
    passes = eligible and correct * 100 >= expected_count * 95 and evidence_correct == predicted_count and (numeric_count == 0 or numeric_correct * 100 >= numeric_count * 95) and abstained == absent_count
    fingerprint = hashlib.sha256(json.dumps(examples, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    return {'schemaVersion': 1, 'family': family, 'exampleCount': len(ids), 'independentDocumentCount': len(independent_ids),
            'datasetSha256': fingerprint, 'criticalFieldExactMatch': ratio(correct, expected_count),
            'numericUnitAccuracy': ratio(numeric_correct, numeric_count), 'evidenceValidity': ratio(evidence_correct, predicted_count),
            'abstention': ratio(abstained, absent_count), 'representativeBenchmarkEligible': bool(eligible),
            'benchmarkGatePassed': bool(passes), 'enabled': False,
            'limitations': ['Smoke benchmark only; human confirmation required', 'Runtime admission is a separate reviewed configuration; this report never enables a parser']}
