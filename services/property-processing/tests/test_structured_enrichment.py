import copy
import unittest
from property_processing.structured_enrichment import enrich
from property_processing.sources import SourceError

class StructuredEnrichment(unittest.TestCase):
    lines=[{'text':'Unit area: 123.45 m2','page':1,'bbox':[.1,.1,.8,.2]}]
    def test_no_credentials_still_has_generic_review(self):
        def forbidden(_):raise AssertionError('Disabled provider was called')
        result=enrich(self.lines,'en',adapter=forbidden)
        self.assertEqual(result['state'],'disabled');self.assertEqual(result['candidates'][0]['normalizedValue']['amount'],'123.45')
        self.assertTrue(result['reviewRequired'])

    def test_invalid_or_unsupported_provider_claim_rejected(self):
        proposal=enrich(self.lines,'en')['candidates'][0]
        for key,value in [('normalizedValue',{'amount':'999','unit':'m2','basis':'document_unit_area'}),('field','bedrooms'),('review',{'status':'accepted'}),('command','publish')]:
            changed=copy.deepcopy(proposal);changed[key]=value
            with self.assertRaises(SourceError):enrich(self.lines,'en',enabled=True,adapter=lambda _,p=changed:{'schemaVersion':1,'proposals':[p]})
        with self.assertRaises(SourceError):enrich(self.lines,'en',enabled=True)
        result=enrich(self.lines,'en',enabled=True,adapter=lambda _:{'schemaVersion':1,'proposals':[proposal]})
        self.assertEqual(result['supportedProposals'],1);self.assertTrue(result['reviewRequired'])
