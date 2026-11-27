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
        self.assertEqual(set(public),{"id","nickname","category","title","body","created_at","reply","progress","pinned","context","replied_at","edited_at","revision","votes"})
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
    def test_edit_requires_owner_and_review(self):
        self.call("submit",self.data)
        self.db.execute("UPDATE messages SET visibility='approved',reply='旧回复',progress='done' WHERE id=?",(self.mid,))
        self.assertEqual(self.call("detail",{"p_id":self.mid})["id"],self.mid)
        args=dict(p_id=self.mid,p_secret=self.secret,p_revision=0,p_title="更新标题",p_body="这里是修改后的建议")
        with self.assertRaises(server.Problem):
            self.call("edit",dict(args,p_secret=self.other))
        self.assertEqual(self.call("edit",args)["revision"],1)
        self.assertEqual(self.call("edit",args)["revision"],1)
        row=self.call("mine",{"p_secret":self.secret})[0]
        self.assertEqual((row["visibility"],row["progress"],row["reply"]),("pending","new",""))
        with self.assertRaises(server.Problem):
            self.call("detail",{"p_id":self.mid})
        with self.assertRaises(server.Problem) as err:
            self.call("edit",dict(args,p_title="冲突"))
        self.assertEqual(err.exception.code,409)
        self.assertEqual(row["contact"],self.data["p_contact"])
    def test_detail_private_and_progress(self):
        self.call("submit",dict(self.data,p_private=True))
        self.db.execute("UPDATE messages SET visibility='approved',progress='done' WHERE id=?",(self.mid,))
        with self.assertRaises(server.Problem):
            self.call("detail",{"p_id":self.mid})
        self.assertEqual(self.call("public",{"p_progress":"done"}),[])
        self.db.execute("UPDATE messages SET private=0 WHERE id=?",(self.mid,))
        self.assertEqual(len(self.call("public",{"p_progress":"done"})),1)
        self.assertEqual(self.call("public",{"p_progress":"new"}),[])
    def test_deleted_messages_still_count_towards_rate(self):
        for _ in range(3):
            mid=str(uuid.uuid4())
            self.call("submit",dict(self.data,p_id=mid))
            self.call("withdraw",dict(p_id=mid,p_secret=self.secret))
        with self.assertRaises(server.Problem) as err:
            self.call("submit",self.data)
        self.assertEqual(err.exception.code,429)
    def test_private_screenshot_access_and_removal(self):
        import base64
        encoded="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AD//Z"
        p=dict(self.data,p_screenshot=encoded)
        self.call("submit",p)
        self.call("submit",p)
        self.db.execute("UPDATE messages SET visibility='approved' WHERE id=?",(self.mid,))
        public=self.call("detail",{"p_id":self.mid})
        self.assertNotIn("has_attachment",public)
        self.assertNotIn("image",public)
        mine=self.call("mine",{"p_secret":self.secret})[0]
        self.assertEqual(mine["has_attachment"],1)
        with self.assertRaises(server.Problem):
            self.call("attachment",dict(p_id=self.mid,p_secret=self.other))
        with self.assertRaises(server.Problem):
            self.call("remove_attachment",dict(p_id=self.mid,p_secret=self.other))
        self.assertEqual(self.call("attachment",dict(p_id=self.mid,p_secret=self.secret))["image"],encoded)
        old=server.ADMIN_TOKEN
        server.ADMIN_TOKEN="test-admin-"+"z"*40
        try:
            self.assertEqual(self.call("attachment",dict(p_id=self.mid,p_admin=server.ADMIN_TOKEN))["image"],encoded)
            self.assertEqual(self.call("admin_counts",{"p_admin":server.ADMIN_TOKEN})["approved"],1)
            self.assertEqual(len(self.call("admin_list",{"p_admin":server.ADMIN_TOKEN,"p_filter":"todo"})["records"]),1)
        finally:
            server.ADMIN_TOKEN=old
        self.assertTrue(self.call("remove_attachment",dict(p_id=self.mid,p_secret=self.secret)))
        with self.assertRaises(server.Problem):
            self.call("attachment",dict(p_id=self.mid,p_secret=self.secret))
    def test_invalid_screenshot_and_cascade(self):
        import base64
        with self.assertRaises(server.Problem):
            self.call("submit",dict(self.data,p_screenshot="not-image"))
        encoded="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AD//Z"
        self.call("submit",dict(self.data,p_screenshot=encoded))
        self.call("withdraw",dict(p_id=self.mid,p_secret=self.secret))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM attachments").fetchone()[0],0)
    def test_owner_update_summary_is_minimal_and_private(self):
        self.call("submit",dict(self.data,p_private=True))
        self.assertEqual(self.call("my_updates",{"p_secret":self.other}),[])
        own=self.call("my_updates",{"p_secret":self.secret})
        self.assertEqual(len(own),1)
        self.assertEqual(set(own[0]),{"id","revision","visibility","progress","has_reply"})
        self.assertEqual(own[0]["has_reply"],0)
        self.db.execute("UPDATE messages SET revision=revision+1,reply='处理完成',progress='done' WHERE id=?",(self.mid,))
        changed=self.call("my_updates",{"p_secret":self.secret})[0]
        self.assertEqual((changed["revision"],changed["progress"],changed["has_reply"]),(1,"done",1))
    def test_admin_device_session(self):
        old=server.ADMIN_TOKEN
        server.ADMIN_TOKEN="test-admin-"+"z"*40
        try:
            with self.assertRaises(server.Problem):
                self.call("admin_login",{"p_admin":"wrong"})
            session=self.call("admin_login",{"p_admin":server.ADMIN_TOKEN,"p_remember":True})["session"]
            self.assertTrue(session.startswith("gb1."))
            self.assertEqual(self.call("admin_counts",{"p_admin":session})["private"],0)
            self.assertNotEqual(self.db.execute("SELECT token_hash FROM admin_sessions").fetchone()[0],session)
            with self.assertRaises(server.Problem):
                self.call("admin_login",{"p_admin":session})
            self.call("admin_logout",{"p_admin":session})
            with self.assertRaises(server.Problem):
                self.call("admin_counts",{"p_admin":session})
            session=self.call("admin_login",{"p_admin":server.ADMIN_TOKEN})["session"]
            self.db.execute("UPDATE admin_sessions SET expires_epoch=0")
            with self.assertRaises(server.Problem):
                self.call("admin_counts",{"p_admin":session})
            session=self.call("admin_login",{"p_admin":server.ADMIN_TOKEN})["session"]
            server.ADMIN_TOKEN="new-admin-"+"x"*40
            with self.assertRaises(server.Problem):
                self.call("admin_counts",{"p_admin":session})
        finally:
            server.ADMIN_TOKEN=old
    def test_admin_devices_and_filter(self):
        old=server.ADMIN_TOKEN
        server.ADMIN_TOKEN="test-admin-"+"z"*40
        try:
            a=self.call("admin_login",{"p_admin":server.ADMIN_TOKEN})["session"]
            b=self.call("admin_login",{"p_admin":server.ADMIN_TOKEN})["session"]
            self.assertEqual(self.call("admin_devices",{"p_admin":a})["active"],2)
            with self.assertRaises(server.Problem):
                self.call("admin_revoke_others",{"p_admin":"wrong"})
            self.assertEqual(self.call("admin_revoke_others",{"p_admin":a})["active"],1)
            with self.assertRaises(server.Problem):
                self.call("admin_counts",{"p_admin":b})
            self.call("submit",self.data)
            self.call("submit",dict(self.data,p_id=str(uuid.uuid4()),p_category="correction"))
            r=self.call("admin_list",{"p_admin":a,"p_filter":"all","p_category":"correction","p_sort":"oldest"})
            self.assertEqual(r["total"],1)
            self.assertEqual(r["records"][0]["category"],"correction")
        finally:
            server.ADMIN_TOKEN=old
if __name__=="__main__":
    unittest.main()
