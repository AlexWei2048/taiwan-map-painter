"""Run from the backend directory: python -m unittest -v test_guestbook"""
import tempfile
import unittest
import uuid
from pathlib import Path
from contextlib import closing
import server

class GuestbookTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        server.DB=Path(self.temp.name)/"test.sqlite3"
        server.initialize()
        self.db=server.connect()
        self.secret="a"*64
        self.other="b"*64
        self.mid=str(uuid.uuid4())
        self.data=dict(p_id=self.mid,p_secret=self.secret,p_nickname="测试",p_category="feature",p_body="希望增加更多地图",p_contact="private-test@example.invalid")
    def tearDown(self):
        self.db.close()
        self.temp.cleanup()
    def call(self,action,data):
        return server.dispatch("guestbook_"+action,data,self.db)
    def test_privacy_moderation_and_removal(self):
        self.assertEqual(self.call("submit",self.data)["visibility"],"pending")
        self.assertEqual(self.call("public",{}),[])
        self.assertEqual(self.call("mine",{"p_secret":self.other}),[])
        self.assertEqual(self.call("mine",{"p_secret":self.secret})[0]["contact"],self.data["p_contact"])
        self.db.execute("UPDATE messages SET visibility='approved' WHERE id=?",(self.mid,))
        public=self.call("public",{})[0]
        self.assertEqual(set(public),{"id","nickname","category","title","body","created_at","reply","progress","pinned","context","replied_at","votes"})
        self.assertNotIn(self.data["p_contact"],str(public))
        self.assertFalse(self.call("remove_contact",{"p_id":self.mid,"p_secret":self.other}))
        self.assertTrue(self.call("remove_contact",{"p_id":self.mid,"p_secret":self.secret}))
        self.assertIsNone(self.call("mine",{"p_secret":self.secret})[0]["contact"])
    def test_idempotency_and_limit(self):
        self.call("submit",self.data)
        self.call("submit",self.data)
        self.assertEqual(len(self.call("mine",{"p_secret":self.secret})),1)
        with self.assertRaises(server.Problem):
            self.call("submit",dict(self.data,p_secret=self.other))
        for _ in range(2):
            self.call("submit",dict(self.data,p_id=str(uuid.uuid4())))
        with self.assertRaises(server.Problem) as err:
            self.call("submit",dict(self.data,p_id=str(uuid.uuid4())))
        self.assertEqual(err.exception.code,429)
    def test_reject_contact_in_public_body(self):
        with self.assertRaises(server.Problem):
            self.call("submit",dict(self.data,p_body="联系方式 "+self.data["p_contact"]))
    def test_invalid_credential(self):
        with self.assertRaises(server.Problem):
            self.call("mine",{"p_secret":"guess"})
    def test_private_and_admin(self):
        old=server.ADMIN_TOKEN
        server.ADMIN_TOKEN="test-admin-"+"z"*40
        try:
            self.call("submit",dict(self.data,p_private=True,p_title="私密建议"))
            self.db.execute("UPDATE messages SET visibility='approved' WHERE id=?",(self.mid,))
            self.assertEqual(self.call("public",{}),[])
            with self.assertRaises(server.Problem):
                self.call("admin_list",{"p_admin":"wrong"})
            admin=self.call("admin_list",{"p_admin":server.ADMIN_TOKEN,"p_filter":"all"})
            self.assertEqual(admin["records"][0]["contact"],self.data["p_contact"])
            self.assertTrue(self.call("admin_update",dict(p_admin=server.ADMIN_TOKEN,p_id=self.mid,p_visibility="approved",p_progress="working",p_reply="已收到",p_pinned=True)))
            self.assertEqual(self.call("mine",{"p_secret":self.secret})[0]["progress"],"working")
            self.assertEqual(self.call("public",{}),[])
            self.assertFalse(self.call("withdraw",{"p_id":self.mid,"p_secret":self.other}))
            self.assertTrue(self.call("withdraw",{"p_id":self.mid,"p_secret":self.secret}))
        finally:
            server.ADMIN_TOKEN=old
    def test_search_votes_and_changed_retry(self):
        self.call("submit",dict(self.data,p_title="地图功能"))
        with self.assertRaises(server.Problem) as err:
            self.call("submit",dict(self.data,p_title="修改后的标题"))
        self.assertEqual(err.exception.code,409)
        self.db.execute("UPDATE messages SET visibility='approved' WHERE id=?",(self.mid,))
        self.assertEqual(len(self.call("public",{"p_search":"地图功能"})),1)
        self.assertEqual(self.call("public",{"p_search":"不存在"}),[])
        for _ in range(2):
            self.assertEqual(self.call("vote",dict(p_id=self.mid,p_secret=self.other,p_desired=True))["votes"],1)
        self.assertEqual(self.call("vote",dict(p_id=self.mid,p_secret=self.other,p_desired=False))["votes"],0)
if __name__=="__main__":
    unittest.main()
