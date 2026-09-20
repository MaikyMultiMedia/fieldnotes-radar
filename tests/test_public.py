import json
import threading
import unittest
from urllib.request import urlopen,Request
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from app import Handler,ROOT

class PublicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_private_routes_are_absent(self):
        for path in ('/api/state','/api/holdings','/data/research.sqlite3','/.env','/seed.json','/../README.md'):
            with self.assertRaises(HTTPError) as err:urlopen(self.url+path)
            self.assertEqual(err.exception.code,404)
        with self.assertRaises(HTTPError) as err:urlopen(Request(self.url,data=b'{}',method='POST'))
        self.assertEqual(err.exception.code,501)
    def test_public_fixture_is_only_synthetic(self):
        with urlopen(self.url+'/feed.json') as r:feed=json.load(r)
        self.assertEqual(feed['mode'],'demo')
        self.assertTrue(all(e['contract'] is None for e in feed['events']))
        self.assertNotIn('wallet',feed)
        self.assertNotIn('holdings',(ROOT/'site'/'index.html').read_text())
