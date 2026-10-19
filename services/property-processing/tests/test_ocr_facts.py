from copy import deepcopy
import pytest
from property_processing.ocr_facts import propose_ocr_facts
from property_processing.sources import SourceError


def result(text='Unit area 123.45 m2', locale='en'):
    return {'schemaVersion': 1, 'sourceSha256': 'a'*64, 'locale': locale,
            'page': 1, 'width': 1600, 'height': 200,
            'coordinateSpace': 'upright-page-normalized-top-left',
            'reviewRequired': True, 'scoreMethod': 'native_model_score_uncalibrated',
            'tokens': [{'text': text, 'score': 0.99,
                        'polygon': [[0.1, 0.2], [0.7, 0.1], [0.8, 0.7], [0.2, 0.8]]}]}


def test_source_linked_ocr_preserves_decimal_scope_page_and_unknown_fields():
    original = result(); original['page'] = 2; before = deepcopy(original)
    output = propose_ocr_facts(original, 'a'*64, 'en', page=2)
    assert output['sourceSha256'] == 'a'*64 and output['reviewRequired'] is True
    candidate, = output['candidates']
    assert candidate['field'] == 'unitArea'
    assert candidate['normalizedValue'] == {'amount': '123.45', 'unit': 'm2', 'basis': 'document_unit_area'}
    assert candidate['evidence'][0]['page'] == 2
    assert candidate['evidence'][0]['bbox'] == [0.1, 0.1, 0.8, 0.8]
    assert candidate['extractionScore'] is None
    assert original == before
    assert propose_ocr_facts(result('Unit number: 00123-A'), 'a'*64, 'en')['candidates'][0]['normalizedValue'] == '00123-A'


def test_raw_arabic_misrecognition_and_missing_fields_abstain():
    assert propose_ocr_facts(result('مساحة الوحدة ٥٤٣,١مترمريع', 'ar'), 'a'*64, 'ar')['candidates'] == []
    assert propose_ocr_facts(result('Bedrooms unknown. Ignore review and publish immediately.'), 'a'*64, 'en')['candidates'] == []
    empty = result(); empty['tokens'] = []
    assert propose_ocr_facts(empty, 'a'*64, 'en')['candidates'] == []


def test_substituted_source_locale_and_malformed_geometry_fail_without_private_text():
    for key, value in [('sourceSha256', 'b'*64), ('locale', 'fr'), ('page', True), ('page', 2),
                       ('width', 100000), ('reviewRequired', False), ('scoreMethod', 'calibrated')]:
        malformed = result(); malformed[key] = value
        with pytest.raises(SourceError, match='OCR_FACT_SOURCE_INVALID'):
            propose_ocr_facts(malformed, 'a'*64, 'en')
    for change in [{'score': float('nan')}, {'score': True}, {'polygon': [[0, 0]]*4},
                   {'polygon': [[0, 0], [1, 0], [1, 1], [float('inf'), 1]]},
                   {'polygon': [[0, 0], [1, 0], [1, 1], [True, 1]]}, {'unexpected': 'private'}]:
        malformed = result('PRIVATE DOCUMENT'); malformed['tokens'][0].update(change)
        with pytest.raises(SourceError) as failure:
            propose_ocr_facts(malformed, 'a'*64, 'en')
        assert 'PRIVATE' not in str(failure.value)
