import json
from pathlib import Path
import tempfile
import unittest
from property_processing.document_benchmark import report_file

class BenchmarkCommand(unittest.TestCase):
    def test_reports_abstention_and_does_not_overwrite_or_expose_source_text(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest=Path(directory,'manifest.json');report=Path(directory,'report.json')
            line={'text':'Unit area: 123.45 m2','page':1,'bbox':[.1,.1,.8,.2]}
            manifest.write_text(json.dumps([{'id':'authored','independentDocumentId':'authored','sourceSha256':'a'*64,'authorizationReference':'self-authored secret reference','representative':False,'authored':True,'locale':'en','category':['native'],'lines':[line],'expected':[{'field':'unitArea','value':{'amount':'123.45','unit':'m2','basis':'document_unit_area'},'page':1,'bbox':line['bbox'],'quotedText':line['text']}],'absentFields':['bedrooms']}]))
            result=report_file('uae_deed_v1',manifest,report)
            self.assertFalse(result['enabled']);self.assertFalse(result['benchmarkGatePassed'])
            self.assertNotIn('secret reference',report.read_text());self.assertNotIn(line['text'],report.read_text())
            with self.assertRaises(ValueError):report_file('uae_deed_v1',manifest,report)
            invalid=Path(directory,'symlink.json');invalid.symlink_to(manifest)
            with self.assertRaises(ValueError):report_file('uae_deed_v1',invalid,Path(directory,'new.json'))
