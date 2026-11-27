#!/usr/bin/env python3
"""Standalone Island Palette guestbook. Python 3.11+, SQLite, no external dependencies."""
import argparse
import hashlib
import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DB = Path(os.environ.get("GUESTBOOK_DB", "private-data/guestbook.sqlite3"))
ORIGIN = os.environ.get("GUESTBOOK_ORIGIN", "https://alexwei2048.github.io")
CATEGORIES = {"suggestion", "correction", "feature", "other"}
PUBLIC = "id,nickname,category,body,created_at,reply"
SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, nickname TEXT NOT NULL,
 category TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
 created_epoch INTEGER NOT NULL, visibility TEXT NOT NULL DEFAULT 'pending'
 CHECK(visibility IN ('pending','approved','rejected')), reply TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS contacts (
 message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE, contact TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS by_owner ON messages(owner_hash,created_epoch);
CREATE INDEX IF NOT EXISTS by_public ON messages(visibility,created_epoch);
CREATE INDEX IF NOT EXISTS by_time ON messages(created_epoch);
"""
class Problem(Exception):
    def __init__(self, message, code=400):
        super().__init__(message)
        self.code = code

def connect():
    DB.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db

def initialize():
    os.umask(0o077)
    with closing(connect()) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)
    DB.chmod(0o600)

def owner(secret):
    if not isinstance(secret,str) or not re.fullmatch("[0-9a-f]{64}",secret):
        raise Problem("无效的留言凭证")
    return hashlib.sha256(secret.encode("ascii")).hexdigest()

def field(data,name,limit,default=""):
    val = data.get(name,default)
    if not isinstance(val,str) or len(val)>limit:
        raise Problem("请检查留言内容和长度")
    return val.strip()

def msg_id(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError,TypeError,AttributeError):
        raise Problem("无效的留言凭证") from None

def rows(cursor):
    return [dict(r) for r in cursor]

def dispatch(action,data,db):
    if action == "guestbook_public":
        category=field(data,"p_category",24)
        if category and category not in CATEGORIES:
            raise Problem("请检查留言类别")
        offset=data.get("p_offset",0)
        if type(offset) is not int or not 0<=offset<=10000:
            raise Problem("无效分页")
        return rows(db.execute("SELECT "+PUBLIC+" FROM messages WHERE visibility='approved' AND (?='' OR category=?) ORDER BY created_epoch DESC,id DESC LIMIT 20 OFFSET ?",(category,category,offset)))
    if action == "guestbook_mine":
        digest=owner(data.get("p_secret"))
        return rows(db.execute("""SELECT m.id,m.nickname,m.category,m.body,m.created_at,m.visibility,m.reply,c.contact
           FROM messages m LEFT JOIN contacts c ON m.id=c.message_id WHERE m.owner_hash=?
           ORDER BY m.created_epoch DESC,m.id DESC LIMIT 100""",(digest,)))
    if action == "guestbook_remove_contact":
        digest=owner(data.get("p_secret"))
        mid=msg_id(data.get("p_id"))
        if not db.execute("SELECT 1 FROM messages WHERE id=? AND owner_hash=?",(mid,digest)).fetchone():
            return False
        db.execute("DELETE FROM contacts WHERE message_id=?",(mid,))
        return True
    if action != "guestbook_submit":
        raise Problem("接口不存在",404)
    digest=owner(data.get("p_secret"))
    mid=msg_id(data.get("p_id"))
    nick=field(data,"p_nickname",24) or "匿名访客"
    category=field(data,"p_category",24)
    body=field(data,"p_body",1500)
    contact=field(data,"p_contact",200)
    if category not in CATEGORIES or not 5<=len(body)<=1500:
        raise Problem("请检查留言内容和长度")
    if contact and (contact.casefold() in body.casefold() or contact.casefold() in nick.casefold()):
        raise Problem("请勿在公开内容中填写联系方式")
    now=int(time.time())
    db.execute("BEGIN IMMEDIATE")
    try:
        existing=db.execute("SELECT owner_hash,visibility FROM messages WHERE id=?",(mid,)).fetchone()
        if existing:
            if existing["owner_hash"]!=digest:
                raise Problem("无效的留言凭证")
            db.execute("COMMIT")
            return {"id":mid,"visibility":existing["visibility"]}
        if db.execute("SELECT COUNT(*) FROM messages WHERE owner_hash=? AND created_epoch>?",(digest,now-600)).fetchone()[0]>=3 or db.execute("SELECT COUNT(*) FROM messages WHERE created_epoch>?",(now-600,)).fetchone()[0]>=50:
            raise Problem("留言过于频繁，请稍后重试",429)
        db.execute("INSERT INTO messages(id,owner_hash,nickname,category,body,created_at,created_epoch) VALUES(?,?,?,?,?,?,?)",(mid,digest,nick,category,body,datetime.now(timezone.utc).isoformat(),now))
        if contact:
            db.execute("INSERT INTO contacts(message_id,contact) VALUES(?,?)",(mid,contact))
        db.execute("COMMIT")
        return {"id":mid,"visibility":"pending"}
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise

class Handler(BaseHTTPRequestHandler):
    server_version="IslandGuestbook/1"
    def log_message(self,*args):
        # Never log request bodies, credentials, contacts or URLs.
        pass
    def setup(self):
        super().setup()
        self.connection.settimeout(12)
    def reply(self,code,payload):
        body=json.dumps(payload,ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        if self.headers.get("Origin")==ORIGIN:
            self.send_header("Access-Control-Allow-Origin",ORIGIN)
        self.send_header("Vary","Origin")
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_OPTIONS(self):
        if self.headers.get("Origin")!=ORIGIN:
            return self.reply(403,{"message":"来源不允许"})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin",ORIGIN)
        self.send_header("Access-Control-Allow-Methods","POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.send_header("Vary","Origin")
        self.send_header("Content-Length","0")
        self.end_headers()
    def do_GET(self):
        if self.path=="/health":
            return self.reply(200,{"ok":True})
        self.reply(404,{"message":"接口不存在"})
    def do_POST(self):
        try:
            if self.headers.get("Origin")!=ORIGIN:
                raise Problem("来源不允许",403)
            prefix="/api/guestbook/"
            if not self.path.startswith(prefix):
                raise Problem("接口不存在",404)
            action=self.path[len(prefix):]
            if action not in {"guestbook_submit","guestbook_public","guestbook_mine","guestbook_remove_contact"}:
                raise Problem("接口不存在",404)
            if self.headers.get_content_type()!="application/json":
                raise Problem("请求格式错误",415)
            try:
                n=int(self.headers.get("Content-Length","0"))
            except ValueError:
                raise Problem("请求格式错误") from None
            if not 0<n<=16384:
                raise Problem("请求过大或为空",413)
            data=json.loads(self.rfile.read(n))
            if not isinstance(data,dict):
                raise Problem("请求格式错误")
            with closing(connect()) as db:
                result=dispatch(action,data,db)
            self.reply(200,result)
        except Problem as e:
            self.reply(e.code,{"message":str(e)})
        except (ValueError,UnicodeError):
            self.reply(400,{"message":"请求格式错误"})
        except (BrokenPipeError,ConnectionResetError,TimeoutError):
            pass
        except Exception:
            self.reply(500,{"message":"留言服务暂时不可用，请重试"})

def admin(args):
    # Only local filesystem-authorized server operators can invoke these actions.
    with closing(connect()) as db:
        if args.command=="list":
            result=rows(db.execute("""SELECT m.id,m.nickname,m.category,m.body,m.created_at,m.visibility,m.reply,c.contact
              FROM messages m LEFT JOIN contacts c ON m.id=c.message_id WHERE (?='all' OR m.visibility=?) ORDER BY m.created_epoch DESC LIMIT 200""",(args.status,args.status)))
            print(json.dumps(result,ensure_ascii=False,indent=2))
        elif args.command=="review":
            mid=msg_id(args.id)
            if len(args.reply)>1500:
                raise SystemExit("回复不能超过1500字")
            if not db.execute("SELECT 1 FROM messages WHERE id=?",(mid,)).fetchone():
                raise SystemExit("留言不存在")
            private=db.execute("SELECT contact FROM contacts WHERE message_id=?",(mid,)).fetchone()
            if private and private["contact"].casefold() in args.reply.casefold():
                raise SystemExit("公开回复不得包含联系方式")
            db.execute("UPDATE messages SET visibility=?,reply=? WHERE id=?",(args.status,args.reply,mid))
            print("已更新")

def main():
    p=argparse.ArgumentParser()
    commands=p.add_subparsers(dest="command",required=True)
    serve=commands.add_parser("serve")
    serve.add_argument("--host",default="127.0.0.1")
    serve.add_argument("--port",type=int,default=int(os.environ.get("PORT","8787")))
    listing=commands.add_parser("list")
    listing.add_argument("--status",choices=["all","pending","approved","rejected"],default="pending")
    review=commands.add_parser("review")
    review.add_argument("id")
    review.add_argument("status",choices=["approved","rejected","pending"])
    review.add_argument("--reply",default="")
    args=p.parse_args()
    initialize()
    if args.command=="serve":
        ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()
    else:
        admin(args)
if __name__=="__main__":
    main()
