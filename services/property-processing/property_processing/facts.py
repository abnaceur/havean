"""Generic, anchored candidate extraction. Country profiles remain disabled.

Callers supply source-linked OCR or native glyph lines in upright normalized coordinates. No source text
is a command, and missing fields are omitted rather than filled with defaults.
"""
import re
from decimal import Decimal, InvalidOperation
from datetime import date
from .sources import SourceError

_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
UNKNOWN_TEXT = frozenset(('unknown', 'not available', 'n/a', 'inconnu', 'non disponible', 'غير معروف', 'غير متوفر'))


def normalize_decimal(raw: str, locale: str) -> str:
    if locale not in ('en', 'fr', 'ar') or not isinstance(raw, str) or len(raw) > 64:
        raise SourceError('INVALID_QUANTITY')
    value = raw.translate(_DIGITS).strip().replace('\u00a0', ' ').replace('\u202f', ' ')
    if '٫' in value or '٬' in value:
        if '.' in value or ',' in value:
            raise SourceError('AMBIGUOUS_QUANTITY')
        decimal_separator, group_separator = '٫', '٬'
    elif locale == 'fr':
        decimal_separator, group_separator = ',', ' '
    else:
        decimal_separator, group_separator = '.', ','
    parts = value.split(decimal_separator)
    if len(parts) > 2 or (len(parts) == 2 and not re.fullmatch(r'[0-9]{1,8}', parts[1])):
        raise SourceError('INVALID_QUANTITY')
    whole = parts[0]
    if group_separator in whole:
        if not re.fullmatch(r'[0-9]{1,3}(?:' + re.escape(group_separator) + r'[0-9]{3})+', whole):
            raise SourceError('AMBIGUOUS_QUANTITY')
        whole = whole.replace(group_separator, '')
    if not re.fullmatch(r'[0-9]{1,13}', whole):
        raise SourceError('INVALID_QUANTITY')
    normalized = whole + ('.' + parts[1] if len(parts) == 2 else '')
    try:
        result = format(Decimal(normalized), 'f')
    except InvalidOperation as exc:
        raise SourceError('INVALID_QUANTITY') from exc
    if len(result.split('.')[0]) > 13:
        raise SourceError('INVALID_QUANTITY')
    return result


def normalize_identifier(raw: str) -> str:
    if not isinstance(raw, str) or not raw.strip() or len(raw) > 200:
        raise SourceError('INVALID_IDENTIFIER')
    # Leading zeros and nonnumeric components are part of the identifier.
    return raw.translate(_DIGITS).strip()


def normalize_date(raw: str, calendar: str) -> dict:
    # No automatic Hijri/Gregorian conversion or ambiguous day/month guessing.
    if calendar not in ('gregorian', 'hijri', 'unknown') or not isinstance(raw, str):
        raise SourceError('INVALID_DATE')
    value = raw.translate(_DIGITS).strip()
    if not re.fullmatch(r'[0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?', value):
        raise SourceError('AMBIGUOUS_DATE')
    parts = [int(part) for part in value.split('-')]
    if parts[0] < 1 or (len(parts) > 1 and not 1 <= parts[1] <= 12):
        raise SourceError('INVALID_DATE')
    if len(parts) == 3:
        if not 1 <= parts[2] <= (30 if calendar == 'hijri' else 31):
            raise SourceError('INVALID_DATE')
        if calendar == 'gregorian':
            try:
                date(*parts)
            except ValueError as exc:
                raise SourceError('INVALID_DATE') from exc
    return {'value': value, 'calendar': calendar, 'precision': ('year', 'month', 'day')[len(parts)-1]}


AREA_LABELS = (
    ('unitArea', 'document_unit_area', r'(?:unit area|surface de l.unité|مساحة الوحدة)'),
    ('landArea', 'document_land_area', r'(?:land area|superficie du terrain|مساحة الأرض)'),
    ('builtUpArea', 'document_built_up_area', r'(?:built.up area|surface bâtie|المساحة المبنية)'),
    ('terraceArea', 'document_terrace_area', r'(?:terrace area|surface de la terrasse|مساحة الشرفة)'),
)
_NUMBER = r'([0-9٠-٩۰-۹][0-9٠-٩۰-۹.,٫٬ \u00a0\u202f]{0,63}?)'
_UNITS = r'(m²|m2|m\^2|م²|م2|متر مربع|ft²|ft2|ha)'
COUNT_LABELS = (
    ('bedrooms', r'(?:bedrooms|bedroom count|nombre de chambres|عدد غرف النوم)'),
    ('livingRooms', r'(?:living rooms|living room count|nombre de salons|عدد غرف المعيشة)'),
    ('bathrooms', r'(?:bathrooms|bathroom count|nombre de salles de bains|عدد الحمامات)'),
    ('parkingSpaces', r'(?:parking spaces|parking space count|nombre de places de parking|عدد مواقف السيارات)'),
)

TEXT_LABELS = (
    ('country', r'(?:country|pays|البلد|الدولة)'),
    ('region', r'(?:region|emirate|wilaya|région|ولاية|إمارة)'),
    ('city', r'(?:city|ville|المدينة)'),
    ('district', r'(?:district|quartier|الحي)'),
    ('address', r'(?:property address|address|adresse|عنوان العقار|العنوان)'),
    ('propertyType', r'(?:property type|type de bien|نوع العقار)'),
    ('tenure', r'(?:tenure|type de tenure|نوع الحيازة)'),
    ('ownerName', r'(?:owner name|nom du propriétaire|اسم المالك)'),
    ('boundary', r'(?:boundary|boundaries|limites|الحدود)'),
)
IDENTIFIER_LABELS = (
    ('plotId', r'(?:plot (?:number|id)|numéro de parcelle|رقم القطعة)'),
    ('buildingId', r'(?:building (?:number|id)|numéro du bâtiment|رقم المبنى)'),
    ('floorId', r'(?:floor (?:number|id)|numéro de l.étage|رقم الطابق)'),
    ('registryId', r'(?:registry (?:number|id)|numéro du registre|رقم السجل)'),
    ('ownerId', r'(?:owner (?:number|id)|identifiant du propriétaire|رقم المالك)'),
)


def generic_candidates(lines: list[dict], locale: str, *, include_counts=False, include_text=False) -> list[dict]:
    if locale not in ('en', 'fr', 'ar') or not isinstance(lines, list) or len(lines) > 10000:
        raise SourceError('INVALID_EXTRACTION_INPUT')
    candidates = []
    extractor_version = 'generic-anchored-v3' if include_text else 'generic-anchored-v2' if include_counts else 'generic-anchored-v1'
    score_method = extractor_version + '-uncalibrated'
    for line in lines:
        if not isinstance(line, dict):
            raise SourceError('INVALID_EVIDENCE')
        text, box, page = line.get('text'), line.get('bbox'), line.get('page')
        if (not isinstance(text, str) or len(text) > 2000 or
                not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= 50 or
                not isinstance(box, list) or len(box) != 4 or
                any(isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= 1 for v in box) or
                not (box[0] < box[2] and box[1] < box[3])):
            raise SourceError('INVALID_EVIDENCE')
        evidence = {'page': page, 'bbox': box.copy(),
                    'coordinateSpace': 'upright-page-normalized-top-left', 'quotedText': text}
        for field, basis, label in AREA_LABELS:
            match = re.search(label + r'\s*[:：]?\s*' + _NUMBER + r'\s*' + _UNITS + r'(?![\w²])', text, re.I)
            if match:
                try:
                    amount = normalize_decimal(match.group(1), locale)
                except SourceError:
                    continue  # Ambiguous numbers require manual review; never guess.
                raw_unit = match.group(2).lower()
                unit = 'ft2' if raw_unit.startswith('ft') else 'ha' if raw_unit == 'ha' else 'm2'
                candidates.append({'field': field, 'rawText': text,
                                   'normalizedValue': {'amount': amount, 'unit': unit, 'basis': basis},
                                   'origin': 'document', 'extractionScore': None,
                                   'scoreMethod': score_method, 'evidence': [evidence],
                                   'extractorVersion': extractor_version})
        identifier = re.search(r'(?:unit (?:number|no\.?|id)|numéro de l.unité|رقم الوحدة)\s*[:：]\s*([\w/-]{1,200})(?!\S)', text, re.I)
        if identifier and normalize_identifier(identifier.group(1)).casefold() not in UNKNOWN_TEXT:
            candidates.append({'field': 'unitId', 'rawText': text,
                               'normalizedValue': normalize_identifier(identifier.group(1)),
                               'origin': 'document', 'extractionScore': None,
                               'scoreMethod': score_method, 'evidence': [evidence],
                               'extractorVersion': extractor_version})
        # Only complete labeled integer segments are count evidence. Decimal,
        # range, approximate and unknown phrases abstain; zero is accepted only
        # when explicitly printed. Do not interpret an area/unit ID as a count.
        for field, label in COUNT_LABELS if include_counts else ():
            for match in re.finditer(r'(?:^|[;\n])\s*' + label + r'\s*[:：]\s*([0-9٠-٩۰-۹]{1,5})\s*(?=$|[;\n])', text, re.I):
                count = int(match.group(1).translate(_DIGITS))
                if count > 10000:
                    continue
                candidates.append({'field': field, 'rawText': text,
                                   'normalizedValue': count, 'origin': 'document',
                                   'extractionScore': None,
                                   'scoreMethod': score_method,
                                   'evidence': [evidence], 'extractorVersion': extractor_version})
        if include_text:
            suffixes = [('bedrooms', r'(?:bedrooms?|chambres?|غرف نوم)'), ('livingRooms', r'(?:living rooms?|salons?|غرف معيشة)'), ('bathrooms', r'(?:bathrooms?|salles? de bains?|حمامات)'), ('parkingSpaces', r'(?:parking spaces?|places? de parking|مواقف سيارات)')]
            for field, noun in suffixes:
                for match in re.finditer(r'(?:^|[;\n])\s*(?:[-•]\s*)?([0-9٠-٩۰-۹]{1,5})\s+' + noun + r'\s*(?=$|[;\n])', text, re.I):
                    count = int(match[1].translate(_DIGITS))
                    if count > 10000:
                        continue
                    candidates.append({'field': field, 'rawText': text, 'normalizedValue': count,
                                       'origin': 'document', 'extractionScore': None, 'scoreMethod': score_method,
                                       'evidence': [evidence], 'extractorVersion': extractor_version})
            for field, label in TEXT_LABELS:
                for match in re.finditer(r'(?:^|[;\n])\s*' + label + r'\s*[:：]\s*([^;\n]{1,500})\s*(?=$|[;\n])', text, re.I):
                    value = match[1].strip()
                    if not value or value.casefold() in UNKNOWN_TEXT:
                        continue
                    candidates.append({'field': field, 'rawText': text, 'normalizedValue': value,
                                       'origin': 'document', 'extractionScore': None, 'scoreMethod': score_method,
                                       'evidence': [evidence], 'extractorVersion': extractor_version})
            for field, label in IDENTIFIER_LABELS:
                for match in re.finditer(r'(?:^|[;\n])\s*' + label + r'\s*[:：]\s*([\w/-]{1,200})\s*(?=$|[;\n])', text, re.I):
                    value = normalize_identifier(match[1])
                    if value.casefold() in UNKNOWN_TEXT:
                        continue
                    candidates.append({'field': field, 'rawText': text, 'normalizedValue': value,
                                       'origin': 'document', 'extractionScore': None, 'scoreMethod': score_method,
                                       'evidence': [evidence], 'extractorVersion': extractor_version})
    return candidates
