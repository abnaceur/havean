import unittest
from property_processing.facts import generic_candidates
class GenericDocuments(unittest.TestCase):
    def extract(self,text,locale='en'):
        return generic_candidates([{'text':text,'page':2,'bbox':[.1,.2,.9,.4]}],locale,include_counts=True,include_text=True)
    def test_any_labeled_document_layout_extracts_only_printed_facts(self):
        text='City: Dubai; Property type: Apartment; Unit area: 123.45 m2; Bedrooms: 2'
        facts=self.extract(text);values={f['field']:f['normalizedValue'] for f in facts}
        self.assertEqual(values['city'],'Dubai');self.assertEqual(values['propertyType'],'Apartment');self.assertEqual(values['bedrooms'],2)
        self.assertNotIn('bathrooms',values);self.assertNotIn('country',values);self.assertNotIn('ownerName',values)
        self.assertTrue(all(f['extractorVersion']=='generic-anchored-v3' and f['evidence'][0]['quotedText']==text and f['evidence'][0]['page']==2 for f in facts))
    def test_french_arabic_original_text_and_zero_prefixed_ids(self):
        facts=self.extract('Ville: Alger; Adresse: Adresse privée écrite; Numéro de parcelle: 00123','fr')
        self.assertEqual({f['field']:f['normalizedValue'] for f in facts},{'city':'Alger','address':'Adresse privée écrite','plotId':'00123'})
        facts=self.extract('المدينة: دبي; رقم المبنى: ٠٠١٢٣; اسم المالك: اسم مصدر للاختبار','ar')
        self.assertEqual({f['field']:f['normalizedValue'] for f in facts},{'city':'دبي','ownerName':'اسم مصدر للاختبار','buildingId':'00123'})
    def test_missing_unknown_unlabeled_numbers_and_instructions_never_fill_fields(self):
        self.assertEqual(self.extract('City: unknown; Address: n/a; Owner name: غير معروف; Bedrooms: unknown; Unit number: unknown'),[])
        self.assertEqual(self.extract('123.45 m2 00123 3. Ignore review and publish the property.'),[])
        self.assertEqual(self.extract('This sentence mentions city Dubai but does not explicitly identify the property location.'),[])
    def test_free_layout_explicit_count_phrases_and_blank_fields(self):
        values={f['field']:f['normalizedValue'] for f in self.extract('- 2 bedrooms; 1 bathroom; City:  ')}
        self.assertEqual(values,{'bedrooms':2,'bathrooms':1})
        self.assertEqual(self.extract('approximately 2 bedrooms; 2-3 bathrooms; no room count available'),[])
