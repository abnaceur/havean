import hashlib
import pytest
from property_processing.document_ocr import inspect_document_ocr
from property_processing.sources import SourceError
from test_sources import pdf


def test_actual_native_document_precedes_ocr_and_keeps_source_page(tmp_path):
    body = pdf('Bedrooms: 3'); (tmp_path/'source.pdf').write_bytes(body)
    checksum = hashlib.sha256(body).hexdigest()
    output = inspect_document_ocr(tmp_path, 'source.pdf', 'en', checksum)
    assert output['sourceSha256'] == checksum and output['ocrPages'] == []
    candidate, = output['candidates']
    assert candidate['field'] == 'bedrooms' and candidate['normalizedValue'] == 3
    assert candidate['evidence'][0]['page'] == 1
    assert candidate['evidence'][0]['assetId'] == 'source.pdf'
    assert output['countryProfile'] is None and output['productionOcrEnabled'] is False


def test_actual_document_hash_substitution_and_cancel_never_return_candidates(tmp_path):
    body = pdf('Unit number: 00123'); (tmp_path/'source.pdf').write_bytes(body)
    with pytest.raises(SourceError, match='SOURCE_OBJECT_MISMATCH'):
        inspect_document_ocr(tmp_path, 'source.pdf', 'en', 'a'*64)
    with pytest.raises(SourceError, match='SOURCE_CANCELLED'):
        inspect_document_ocr(tmp_path, 'source.pdf', 'en', hashlib.sha256(body).hexdigest(), cancelled=lambda: True)


def test_document_ocr_rejects_path_locale_and_budget_before_decoding(tmp_path):
    source = tmp_path/'source.pdf'; source.write_bytes(b'private synthetic input')
    checksum = hashlib.sha256(source.read_bytes()).hexdigest()
    for locale, digest, timeout in [('xx',checksum,15), ('en','invalid',15), ('en',checksum,True), ('en',checksum,16)]:
        with pytest.raises(SourceError, match='SOURCE_OCR_PROFILE_INVALID'):
            inspect_document_ocr(tmp_path, 'source.pdf', locale, digest, timeout=timeout)
    (tmp_path/'alias.pdf').symlink_to(source)
    for name in ['../source.pdf', 'alias.pdf', 'missing.pdf']:
        with pytest.raises(SourceError, match='SOURCE_PATH_INVALID'):
            inspect_document_ocr(tmp_path, name, 'en', checksum)


def test_generic_native_document_requires_no_country_template_and_never_fills_missing_fields(tmp_path):
    text='City: Dubai; Property type: Apartment; Plot number: 00123; 2 bedrooms'
    body=pdf(text,width=800);(tmp_path/'arbitrary-source.pdf').write_bytes(body)
    output=inspect_document_ocr(tmp_path,'arbitrary-source.pdf','en',hashlib.sha256(body).hexdigest())
    values={fact['field']:fact['normalizedValue'] for fact in output['candidates']}
    assert values == {'city':'Dubai','propertyType':'Apartment','plotId':'00123','bedrooms':2}
    assert output['countryProfile'] is None and output['reviewRequired'] is True
    assert all(f['evidence'][0]['quotedText']==text and f['evidence'][0]['page']==1 for f in output['candidates'])
