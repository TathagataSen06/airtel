import unittest
from pricing import BUNDLES, quote

class PricingTests(unittest.TestCase):
    def test_office(self):
        self.assertEqual((quote(BUNDLES['office'])['monthly'],quote(BUNDLES['office'])['setup']), (2670,1500))
    def test_office_without_backup(self):
        items={k:v for k,v in BUNDLES['office'].items() if k!='P09'}
        self.assertEqual((quote(items)['monthly'],quote(items)['setup']), (2171,0))
    def test_retail(self):
        self.assertEqual((quote(BUNDLES['retail'])['monthly'],quote(BUNDLES['retail'])['setup']), (1298,0))
    def test_retail_pos(self):
        self.assertEqual((quote({**BUNDLES['retail'],'P19':1})['monthly'],quote({**BUNDLES['retail'],'P19':1})['setup']), (1897,2500))
    def test_invalid_dependencies(self):
        for items in ({'P01':1,'P09':1},{'P01':1,'P02':1},{'P07':1},{'P01':0},{'P01':True},{'P01':1,'BAD':1}):
            with self.subTest(items=items),self.assertRaises(ValueError): quote(items)

if __name__=='__main__': unittest.main()
