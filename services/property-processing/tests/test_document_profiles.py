import copy
import unittest
from property_processing.document_profiles import FAMILIES, family_candidates, benchmark_family
from property_processing.sources import SourceError

class DocumentProfiles(unittest.TestCase):
    def test_country_profiles_abstain_from_explicit_unknown_values(self):
        for locale, family, texts in [
            ('en', 'uae_deed_v1', ['Plot number: unknown', 'Owner name: not available', 'City: n/a']),
            ('fr', 'algerian_booklet_v1', ['Numéro de parcelle: inconnu', 'Ville: non disponible', 'اسم المالك: غير معروف']),
        ]:
            lines = [{'text': text, 'page': 1, 'bbox': [.1, .1, .8, .2]} for text in texts]
            result = family_candidates(lines, locale, family)
            self.assertEqual(result['candidates'], [])
            self.assertFalse(result['enabled'])

    def test_mixed_original_pages_and_unknown_country(self):
        lines=[{'text':'Surface de l’unité: 184,20 m²','page':1,'bbox':[.1,.1,.8,.2]}, {'text':'رقم القطعة: ٠٠١٢٣','page':2,'bbox':[.1,.2,.8,.3]}, {'text':'اسم المالك: اسم مؤلف للاختبار','page':2,'bbox':[.1,.3,.8,.4]}]
        result=family_candidates(lines,'fr','algerian_booklet_v1')
        self.assertFalse(result['enabled']);self.assertTrue(result['reviewRequired'])
        by_field={c['field']:c for c in result['candidates']}
        self.assertEqual(by_field['unitArea']['normalizedValue'], {'amount':'184.20','unit':'m2','basis':'document_unit_area'})
        self.assertEqual(by_field['plotId']['normalizedValue'],'00123');self.assertEqual(by_field['plotId']['evidence'][0]['page'],2)
        self.assertNotIn('country',by_field);self.assertNotIn('bedrooms',by_field)
        self.assertTrue(all(not p['enabled'] for p in FAMILIES.values()))

    def example(self,index=0):
        line={'text':'Unit area: 123.45 m2','page':1,'bbox':[.1,.1,.8,.2]}
        return {'id':str(index),'independentDocumentId':'authored-'+str(index),'sourceSha256':f'{index+1:064x}', 'authorizationReference':'self-authored test', 'representative':False,'authored':True,'locale':'en','category':['native'], 'lines':[line], 'expected':[{'field':'unitArea','value':{'amount':'123.45','unit':'m2','basis':'document_unit_area'},'page':1,'bbox':line['bbox'],'quotedText':line['text']}], 'absentFields':['bedrooms']}

    def test_perfect_authored_scores_never_admit_country_parser(self):
        report=benchmark_family('uae_deed_v1',[self.example(i) for i in range(10)])
        self.assertEqual(report['criticalFieldExactMatch'],'1.00000000')
        self.assertEqual(report['abstention'],'1.00000000')
        self.assertFalse(report['representativeBenchmarkEligible']);self.assertFalse(report['benchmarkGatePassed']);self.assertFalse(report['enabled'])

    def test_duplicate_authorization_and_invalid_source_labels_fail(self):
        for change in ['duplicate','authorization','evidence','locale']:
            examples=[self.example(0),self.example(1)]
            if change=='duplicate':examples[1]['sourceSha256']=examples[0]['sourceSha256']
            if change=='authorization':examples[1]['authorizationReference']=''
            if change=='evidence':examples[1]['expected'][0]['page']=2
            if change=='locale':examples[1]['locale']='de'
            with self.assertRaises(SourceError):benchmark_family('uae_deed_v1',examples)

    def test_actual_mismatch_scores_and_calendar_abstention(self):
        example=self.example();example['expected'][0]['value']['amount']='999.00'
        report=benchmark_family('uae_deed_v1',[example]);self.assertEqual(report['numericUnitAccuracy'],'0.00000000')
        lines=[{'text':'Document date: 2025-02-29 gregorian','page':1,'bbox':[.1,.1,.8,.2]}, {'text':'Document date: 1447-02-30 hijri','page':2,'bbox':[.1,.1,.8,.2]}]
        candidates=family_candidates(lines,'en','uae_deed_v1')['candidates']
        self.assertEqual(len(candidates),1);self.assertEqual(candidates[0]['normalizedValue']['calendar'],'hijri')
