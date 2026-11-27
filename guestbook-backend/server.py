#!/usr/bin/env python3
"""Standalone Island Palette guestbook. Python 3.11+, SQLite, no external dependencies."""
import argparse
import base64
import binascii
import hashlib
import secrets
import hmac
import threading
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
CATEGORIES = {"suggestion", "correction", "feature", "bug", "other"}
PROGRESS = {"new","accepted","working","done","declined"}
ADMIN_TOKEN = os.environ.get("GUESTBOOK_ADMIN_TOKEN", "")
COLUMNS = {"title":"TEXT NOT NULL DEFAULT ''","context":"TEXT NOT NULL DEFAULT ''","private":"INTEGER NOT NULL DEFAULT 0","progress":"TEXT NOT NULL DEFAULT 'new'","pinned":"INTEGER NOT NULL DEFAULT 0","replied_at":"TEXT NOT NULL DEFAULT ''","request_hash":"TEXT NOT NULL DEFAULT ''","revision":"INTEGER NOT NULL DEFAULT 0","edited_at":"TEXT NOT NULL DEFAULT ''","admin_note":"TEXT NOT NULL DEFAULT ''","priority":"TEXT NOT NULL DEFAULT 'normal'"}
ADMIN_LOCK = threading.Lock()
ADMIN_FAILURES = []
BACKUP_LOCK = threading.Lock()
ATTACHMENT_MAX=180*1024
ATTACHMENT_TOTAL=12*1024*1024
PUBLIC = "m.id,m.nickname,m.category,m.title,m.body,m.created_at,m.reply,m.progress,m.pinned,m.context,m.replied_at,m.edited_at,m.revision,(SELECT COUNT(*) FROM votes v WHERE v.message_id=m.id) AS votes"
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
    db.execute("PRAGMA secure_delete=ON")
    return db

def initialize():
    os.umask(0o077)
    with closing(connect()) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)
        columns={r[1] for r in db.execute("PRAGMA table_info(messages)")}
        if not set(COLUMNS).issubset(columns):
            backup_dir=DB.parent/"backups"
            backup_dir.mkdir(mode=0o700,exist_ok=True)
            before=backup_dir/"before-feedback-v8.sqlite3"
            if not before.exists():
                with closing(sqlite3.connect(before)) as copy:
                    db.backup(copy)
                before.chmod(0o600)
            db.execute("BEGIN IMMEDIATE")
            try:
                for key,definition in COLUMNS.items():
                    if key not in columns:
                        db.execute("ALTER TABLE messages ADD COLUMN "+key+" "+definition)
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise
        db.executescript("""CREATE TABLE IF NOT EXISTS votes(
            message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            owner_hash TEXT NOT NULL, created_epoch INTEGER NOT NULL,
            PRIMARY KEY(message_id,owner_hash));
            CREATE INDEX IF NOT EXISTS votes_by_owner ON votes(owner_hash,created_epoch);
        """)
        db.executescript("""CREATE TABLE IF NOT EXISTS write_events(
            owner_hash TEXT NOT NULL, kind TEXT NOT NULL, created_epoch INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS write_events_time ON write_events(kind,created_epoch);
            CREATE INDEX IF NOT EXISTS write_events_owner ON write_events(owner_hash,kind,created_epoch);
        """)
        db.execute("""CREATE TABLE IF NOT EXISTS attachments (
            message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
            image BLOB NOT NULL, size INTEGER NOT NULL CHECK(size>0)
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS admin_sessions (
            token_hash TEXT PRIMARY KEY, master_hash TEXT NOT NULL,
            created_epoch INTEGER NOT NULL, expires_epoch INTEGER NOT NULL
        )""")
        db.execute("DELETE FROM admin_sessions WHERE expires_epoch<=?",(int(time.time()),))
        db.execute("""CREATE TABLE IF NOT EXISTS admin_audit (
            id INTEGER PRIMARY KEY, message_id TEXT NOT NULL, action TEXT NOT NULL,
            created_at TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT '', progress TEXT NOT NULL DEFAULT ''
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS reports (
            message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            owner_hash TEXT NOT NULL, reason TEXT NOT NULL, created_epoch INTEGER NOT NULL,
            PRIMARY KEY(message_id,owner_hash)
        )""")
    DB.chmod(0o600)

def decode_screenshot(value):
    if value in (None,""): return None
    if not isinstance(value,str) or len(value)>((ATTACHMENT_MAX+2)//3)*4:
        raise Problem("截图过大，请压缩后重试",413)
    try:
        blob=base64.b64decode(value,validate=True)
    except (ValueError,binascii.Error):
        raise Problem("截图格式无效")
    if not 8<=len(blob)<=ATTACHMENT_MAX or not blob.startswith(b"\xff\xd8\xff") or not blob.endswith(b"\xff\xd9"):
        raise Problem("仅支持压缩后的 JPEG 截图")
    # Inspect JPEG frame headers before permitting browser decoding.
    pos=2
    while pos+4<=len(blob) and blob[pos]==255:
        while pos<len(blob) and blob[pos]==255: pos+=1
        if pos>=len(blob): break
        marker=blob[pos]; pos+=1
        if marker in (0xd9,0xda): break
        if pos+2>len(blob): break
        length=int.from_bytes(blob[pos:pos+2],"big")
        if length<2 or pos+length>len(blob): break
        if marker in (0xc0,0xc1,0xc2):
            if length<8: break
            height=int.from_bytes(blob[pos+3:pos+5],"big")
            width=int.from_bytes(blob[pos+5:pos+7],"big")
            if not 1<=width<=1600 or not 1<=height<=1600:
                raise Problem("截图分辨率过大，请缩小后重试")
            return blob
        pos+=length
    raise Problem("JPEG 截图缺少有效图像帧")

def attachment_owner(db,data):
    mid=msg_id(data.get("p_id"))
    if data.get("p_admin"):
        require_admin(data,db)
    else:
        digest=owner(data.get("p_secret"))
        if not db.execute("SELECT 1 FROM messages WHERE id=? AND owner_hash=?",(mid,digest)).fetchone():
            raise Problem("留言不存在",404)
    return mid

def admin_counts(db):
    counts=dict(db.execute("SELECT visibility,COUNT(*) FROM messages GROUP BY visibility").fetchall())
    counts["private"]=db.execute("SELECT COUNT(*) FROM messages WHERE private=1").fetchone()[0]
    counts["todo"]=db.execute("SELECT COUNT(*) FROM messages WHERE progress IN ('new','accepted','working') AND visibility!='rejected'").fetchone()[0]
    counts["done"]=db.execute("SELECT COUNT(*) FROM messages WHERE progress='done'").fetchone()[0]
    counts["latest_pending"]=db.execute("SELECT COALESCE(MAX(created_at),'') FROM messages WHERE visibility='pending'").fetchone()[0]
    return counts

def daily_backup():
    # A consistent SQLite copy on the same volume; not a disaster-recovery backup.
    if not BACKUP_LOCK.acquire(blocking=False):
        return
    try:
        directory=DB.parent/"backups"
        directory.mkdir(mode=0o700,exist_ok=True)
        target=directory/("daily-"+datetime.now(timezone.utc).strftime("%Y-%m-%d")+".sqlite3")
        if not target.exists():
            tmp=target.with_suffix(".tmp")
            with closing(connect()) as source, closing(sqlite3.connect(tmp)) as dest:
                source.backup(dest)
            with closing(sqlite3.connect(tmp)) as verify:
                if verify.execute("PRAGMA quick_check").fetchone()[0]!="ok":
                    raise RuntimeError("Backup integrity check failed")
            tmp.chmod(0o600)
            tmp.replace(target)
            for old in sorted(directory.glob("daily-*.sqlite3"),reverse=True)[7:]:
                old.unlink()
    finally:
        BACKUP_LOCK.release()

def backup_loop():
    while True:
        time.sleep(3600)
        try:
            daily_backup()
        except Exception:
            print("Guestbook backup failed", flush=True)

def record_write(db,digest,kind,now,per_owner,global_limit):
    db.execute("DELETE FROM write_events WHERE created_epoch<?",(now-86400,))
    if db.execute("SELECT COUNT(*) FROM write_events WHERE owner_hash=? AND kind=? AND created_epoch>?",(digest,kind,now-600)).fetchone()[0]>=per_owner or db.execute("SELECT COUNT(*) FROM write_events WHERE kind=? AND created_epoch>?",(kind,now-600)).fetchone()[0]>=global_limit:
        raise Problem("操作过于频繁，请稍后重试",429)
    db.execute("INSERT INTO write_events VALUES(?,?,?)",(digest,kind,now))

def master_hash():
    return hashlib.sha256(ADMIN_TOKEN.encode("utf-8")).hexdigest()

def session_hash(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()

def require_admin(data,db,master_only=False):
    token=data.get("p_admin","")
    if not ADMIN_TOKEN or len(ADMIN_TOKEN)<32:
        raise Problem("管理功能尚未配置",503)
    if not master_only and isinstance(token,str) and re.fullmatch(r"gb1\.[0-9a-f]{64}",token):
        row=db.execute("SELECT master_hash,expires_epoch FROM admin_sessions WHERE token_hash=?",(session_hash(token),)).fetchone()
        if not row or row["expires_epoch"]<=int(time.time()) or not hmac.compare_digest(row["master_hash"],master_hash()):
            raise Problem("管理员登录已过期，请重新验证",403)
        return

    with ADMIN_LOCK:
        now=time.monotonic()
        ADMIN_FAILURES[:]=[x for x in ADMIN_FAILURES if now-x<60]
        if not ADMIN_TOKEN or len(ADMIN_TOKEN)<32:
            raise Problem("管理功能尚未配置",503)
        if not isinstance(token,str) or len(token)>256 or not hmac.compare_digest(token.encode("utf-8"),ADMIN_TOKEN.encode("utf-8")):
            if len(ADMIN_FAILURES)>=20:
                raise Problem("验证过于频繁，请稍后重试",429)
            ADMIN_FAILURES.append(now)
            raise Problem("管理员凭证错误",403)


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
    if action == "guestbook_admin_login":
        require_admin(data,db,master_only=True)
        remember=data.get("p_remember",True)
        if type(remember) is not bool: raise Problem("无效登录选项")
        now=int(time.time())
        expiry=now+(30*86400 if remember else 12*3600)
        token="gb1."+secrets.token_hex(32)
        db.execute("BEGIN IMMEDIATE")
        try:
            db.execute("DELETE FROM admin_sessions WHERE expires_epoch<=? OR master_hash!=?",(now,master_hash()))
            # Retain at most ten active sessions. Oldest devices are retired first.
            db.execute("DELETE FROM admin_sessions WHERE token_hash IN (SELECT token_hash FROM admin_sessions ORDER BY created_epoch DESC,token_hash DESC LIMIT -1 OFFSET 9)")
            db.execute("INSERT INTO admin_sessions VALUES(?,?,?,?)",(session_hash(token),master_hash(),now,expiry))
            db.execute("COMMIT")
        except BaseException:
            if db.in_transaction: db.execute("ROLLBACK")
            raise
        return {"session":token,"expires_at":expiry}
    if action == "guestbook_admin_logout":
        token=data.get("p_admin","")
        if isinstance(token,str) and re.fullmatch(r"gb1\.[0-9a-f]{64}",token):
            db.execute("DELETE FROM admin_sessions WHERE token_hash=?",(session_hash(token),))
        return True
    if action in {"guestbook_admin_devices","guestbook_admin_revoke_others"}:
        require_admin(data,db)
        token=data.get("p_admin","")
        if not re.fullmatch(r"gb1\.[0-9a-f]{64}",token):
            raise Problem("请使用设备会话登录",403)
        digest=session_hash(token)
        now=int(time.time())
        if action=="guestbook_admin_revoke_others":
            db.execute("DELETE FROM admin_sessions WHERE token_hash!=?",(digest,))
        active=db.execute("SELECT COUNT(*) FROM admin_sessions WHERE master_hash=? AND expires_epoch>?",(master_hash(),now)).fetchone()[0]
        return {"active":active}
    if action == "guestbook_admin_counts":
        require_admin(data,db)
        return admin_counts(db)
    if action == "guestbook_attachment":
        mid=attachment_owner(db,data)
        row=db.execute("SELECT image FROM attachments WHERE message_id=?",(mid,)).fetchone()
        if not row: raise Problem("截图已删除或不存在",404)
        return {"image":base64.b64encode(row["image"]).decode("ascii")}
    if action == "guestbook_remove_attachment":
        mid=attachment_owner(db,data)
        db.execute("DELETE FROM attachments WHERE message_id=?",(mid,))
        return True
    if action == "guestbook_detail":
        mid=msg_id(data.get("p_id"))
        row=db.execute("SELECT "+PUBLIC+" FROM messages m WHERE m.id=? AND m.visibility='approved' AND m.private=0",(mid,)).fetchone()
        if not row: raise Problem("留言尚未公开或已撤回",404)
        return dict(row)
    if action == "guestbook_edit":
        digest=owner(data.get("p_secret"))
        mid=msg_id(data.get("p_id"))
        title=field(data,"p_title",80)
        body=field(data,"p_body",1500)
        expected=data.get("p_revision")
        if type(expected) is not int or expected<0 or len(body)<5:
            raise Problem("请检查留言内容")
        db.execute("BEGIN IMMEDIATE")
        try:
            row=db.execute("SELECT m.*,c.contact FROM messages m LEFT JOIN contacts c ON m.id=c.message_id WHERE m.id=? AND m.owner_hash=?",(mid,digest)).fetchone()
            if not row: raise Problem("留言不存在",404)
            if row["title"]==title and row["body"]==body:
                db.execute("COMMIT")
                return {"id":mid,"revision":row["revision"]}
            if row["revision"]!=expected:
                raise Problem("留言已变化，请刷新后再编辑",409)
            if row["contact"] and not row["private"] and any(row["contact"].casefold() in value.casefold() for value in (title,body)):
                raise Problem("请勿在公开内容中填写联系方式")
            record_write(db,digest,"edit",int(time.time()),5,100)
            db.execute("UPDATE messages SET title=?,body=?,visibility='pending',progress='new',reply='',replied_at='',pinned=0,revision=revision+1,edited_at=? WHERE id=?",(title,body,datetime.now(timezone.utc).isoformat(),mid))
            db.execute("COMMIT")
            return {"id":mid,"revision":expected+1}
        except BaseException:
            if db.in_transaction: db.execute("ROLLBACK")
            raise
    if action in {"guestbook_public","guestbook_public_page"}:
        category=field(data,"p_category",24)
        search=field(data,"p_search",100)
        progress=field(data,"p_progress",24)
        if progress and progress not in PROGRESS: raise Problem("无效处理状态")
        sort=field(data,"p_sort",24,"latest")
        if category and category not in CATEGORIES:
            raise Problem("请检查留言类别")
        order={"latest":"m.created_epoch DESC,m.id DESC","popular":"votes DESC,m.created_epoch DESC,m.id DESC","reply":"m.replied_at DESC,m.created_epoch DESC,m.id DESC"}.get(sort)
        offset=data.get("p_offset",0)
        if not order or type(offset) is not int or not 0<=offset<=10000:
            raise Problem("无效分页")
        where=" FROM messages m WHERE m.visibility='approved' AND m.private=0 AND (?='' OR m.category=?) AND (?='' OR m.progress=?) AND (?='' OR instr(lower(m.title||' '||m.body||' '||m.nickname),lower(?))>0)"
        params=(category,category,progress,progress,search,search)
        records=rows(db.execute("SELECT "+PUBLIC+where+" ORDER BY m.pinned DESC,"+order+" LIMIT 20 OFFSET ?",params+(offset,)))
        if action=="guestbook_public": return records
        return {"records":records,"total":db.execute("SELECT COUNT(*)"+where,params).fetchone()[0]}
    if action == "guestbook_my_updates":
        digest=owner(data.get("p_secret"))
        return rows(db.execute("SELECT id,revision,visibility,progress,CASE WHEN reply!='' THEN 1 ELSE 0 END AS has_reply FROM messages WHERE owner_hash=? ORDER BY created_epoch DESC,id DESC LIMIT 100",(digest,)))
    if action == "guestbook_mine":
        digest=owner(data.get("p_secret"))
        return rows(db.execute("SELECT "+PUBLIC+",m.visibility,m.private,c.contact,EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id) AS has_attachment FROM messages m LEFT JOIN contacts c ON m.id=c.message_id WHERE m.owner_hash=? ORDER BY m.created_epoch DESC,m.id DESC LIMIT 100",(digest,)))
    if action == "guestbook_remove_contact":
        digest=owner(data.get("p_secret"))
        mid=msg_id(data.get("p_id"))
        if not db.execute("SELECT 1 FROM messages WHERE id=? AND owner_hash=?",(mid,digest)).fetchone():
            return False
        db.execute("DELETE FROM contacts WHERE message_id=?",(mid,))
        return True
    if action == "guestbook_withdraw":
        digest=owner(data.get("p_secret"))
        mid=msg_id(data.get("p_id"))
        return db.execute("DELETE FROM messages WHERE id=? AND owner_hash=?",(mid,digest)).rowcount==1
    if action == "guestbook_vote":
        digest=owner(data.get("p_secret"))
        mid=msg_id(data.get("p_id"))
        desired=data.get("p_desired",True)
        if type(desired) is not bool:
            raise Problem("无效操作")
        db.execute("BEGIN IMMEDIATE")
        try:
            if not db.execute("SELECT 1 FROM messages WHERE id=? AND visibility='approved' AND private=0",(mid,)).fetchone():
                raise Problem("留言不存在",404)
            now=int(time.time())
            if desired:
                if db.execute("SELECT COUNT(*) FROM votes WHERE owner_hash=? AND created_epoch>?",(digest,now-86400)).fetchone()[0]>=100:
                    raise Problem("操作过于频繁",429)
                db.execute("INSERT OR IGNORE INTO votes VALUES(?,?,?)",(mid,digest,now))
            else:
                db.execute("DELETE FROM votes WHERE message_id=? AND owner_hash=?",(mid,digest))
            count=db.execute("SELECT COUNT(*) FROM votes WHERE message_id=?",(mid,)).fetchone()[0]
            db.execute("COMMIT")
            return {"votes":count,"voted":desired}
        except BaseException:
            if db.in_transaction: db.execute("ROLLBACK")
            raise
    if action == "guestbook_votes":
        digest=owner(data.get("p_secret"))
        return [r[0] for r in db.execute("SELECT message_id FROM votes WHERE owner_hash=? LIMIT 2000",(digest,))]
    if action == "guestbook_report":
        digest=owner(data.get("p_secret"))
        mid=msg_id(data.get("p_id"))
        reason=field(data,"p_reason",24)
        if reason not in {"spam","privacy","abuse","other"}: raise Problem("请选择举报原因")
        db.execute("BEGIN IMMEDIATE")
        try:
            if not db.execute("SELECT 1 FROM messages WHERE id=? AND visibility='approved' AND private=0",(mid,)).fetchone(): raise Problem("留言不存在",404)
            if not db.execute("SELECT 1 FROM reports WHERE message_id=? AND owner_hash=?",(mid,digest)).fetchone():
                record_write(db,digest,"report",int(time.time()),5,100)
                db.execute("INSERT INTO reports VALUES(?,?,?,?)",(mid,digest,reason,int(time.time())))
            db.execute("COMMIT")
            return True
        except BaseException:
            if db.in_transaction: db.execute("ROLLBACK")
            raise
    if action == "guestbook_admin_maintenance":
        require_admin(data,db)
        import shutil
        files=sorted((DB.parent/"backups").glob("daily-*.sqlite3"),reverse=True)
        return {"backup_count":len(files),"latest_backup":files[0].name[6:16] if files else "", "free_mb":shutil.disk_usage(DB.parent).free//(1024*1024),"database_mb":round(DB.stat().st_size/1048576,2)}
    if action == "guestbook_admin_audit":
        require_admin(data,db)
        return rows(db.execute("SELECT message_id,action,created_at,visibility,progress FROM admin_audit ORDER BY id DESC LIMIT 50"))
    if action == "guestbook_admin_export":
        require_admin(data,db)
        # Deliberately export only already-public content, never private notes, contacts or attachments.
        return rows(db.execute("SELECT "+PUBLIC+" FROM messages m WHERE m.visibility='approved' AND m.private=0 ORDER BY m.created_epoch DESC,m.id DESC LIMIT 2000"))
    if action == "guestbook_admin_list":
        require_admin(data,db)
        filt=field(data,"p_filter",24,"pending")
        work=field(data,"p_progress",24)
        search=field(data,"p_search",100)
        category=field(data,"p_category",24)
        sort=field(data,"p_sort",24,"latest")
        if category and category not in CATEGORIES: raise Problem("无效留言类别")
        order={"latest":"m.created_epoch DESC,m.id DESC","oldest":"m.created_epoch ASC,m.id ASC","popular":"votes DESC,m.created_epoch DESC,m.id DESC"}.get(sort)
        if not order: raise Problem("无效排序")
        if work and work not in PROGRESS: raise Problem("无效处理状态")
        if filt not in {"all","pending","approved","rejected","private","todo","reported"}:
            raise Problem("无效筛选")
        offset=data.get("p_offset",0)
        if type(offset) is not int or not 0<=offset<=10000:
            raise Problem("无效分页")
        counts=admin_counts(db)
        conditions=" WHERE (?='all' OR (?='private' AND m.private=1) OR (?='todo' AND m.progress IN ('new','accepted','working') AND m.visibility!='rejected') OR (?='reported' AND EXISTS(SELECT 1 FROM reports rr WHERE rr.message_id=m.id)) OR m.visibility=?) AND (?='' OR m.progress=?) AND (?='' OR m.category=?) AND (?='' OR instr(lower(m.title||' '||m.body||' '||m.nickname),lower(?))>0)"
        params=(filt,filt,filt,filt,filt,work,work,category,category,search,search)
        total=db.execute("SELECT COUNT(*) FROM messages m"+conditions,params).fetchone()[0]
        records=rows(db.execute("SELECT "+PUBLIC+",m.visibility,m.private,m.admin_note,m.priority,(SELECT COUNT(*) FROM reports rr WHERE rr.message_id=m.id) AS reports,c.contact,EXISTS(SELECT 1 FROM attachments a WHERE a.message_id=m.id) AS has_attachment FROM messages m LEFT JOIN contacts c ON m.id=c.message_id"+conditions+" ORDER BY "+order+" LIMIT 50 OFFSET ?",params+(offset,)))
        return {"counts":counts,"records":records,"total":total}
    if action == "guestbook_admin_update":
        require_admin(data,db)
        mid=msg_id(data.get("p_id"))
        visibility=field(data,"p_visibility",24)
        progress=field(data,"p_progress",24)
        reply=field(data,"p_reply",1500)
        pinned=data.get("p_pinned",False)
        if visibility not in {"pending","approved","rejected"} or progress not in PROGRESS or type(pinned) is not bool:
            raise Problem("无效处理状态")
        expected=data.get("p_revision")
        current=db.execute("SELECT m.private,m.reply,m.revision,m.admin_note,m.priority,c.contact FROM messages m LEFT JOIN contacts c ON m.id=c.message_id WHERE m.id=?",(mid,)).fetchone()
        if not current: raise Problem("留言不存在",404)
        if expected is not None and (type(expected) is not int or expected!=current["revision"]):
            raise Problem("留言已变化，请刷新后再审核",409)
        if current["contact"] and not current["private"] and current["contact"].casefold() in reply.casefold():
            raise Problem("公开回复不得包含联系方式")
        admin_note=field(data,"p_admin_note",1000,current["admin_note"])
        priority=field(data,"p_priority",24,current["priority"])
        if priority not in {"low","normal","high"}: raise Problem("无效优先级")
        stamp=datetime.now(timezone.utc).isoformat() if reply!=current["reply"] else None
        updated=db.execute("UPDATE messages SET visibility=?,progress=?,reply=?,pinned=?,replied_at=COALESCE(?,replied_at),admin_note=?,priority=?,revision=revision+1 WHERE id=? AND revision=?",(visibility,progress,reply,int(pinned and not current["private"]),stamp,admin_note,priority,mid,current["revision"]))
        if updated.rowcount!=1: raise Problem("留言已变化，请刷新后再审核",409)
        db.execute("INSERT INTO admin_audit(message_id,action,created_at,visibility,progress) VALUES(?,?,?,?,?)",(mid,"update",datetime.now(timezone.utc).isoformat(),visibility,progress))
        return True
    if action == "guestbook_admin_delete":
        require_admin(data,db)
        mid=msg_id(data.get("p_id"))
        expected=data.get("p_revision")
        if expected is not None and type(expected) is not int: raise Problem("无效版本")
        deleted=db.execute("DELETE FROM messages WHERE id=? AND (? IS NULL OR revision=?)",(mid,expected,expected)).rowcount
        if not deleted: raise Problem("留言已变化，请刷新后再删除",409)
        db.execute("INSERT INTO admin_audit(message_id,action,created_at) VALUES(?,?,?)",(mid,"delete",datetime.now(timezone.utc).isoformat()))
        return True
    if action != "guestbook_submit":
        raise Problem("接口不存在",404)
    digest=owner(data.get("p_secret"))
    mid=msg_id(data.get("p_id"))
    nick=field(data,"p_nickname",24) or "匿名访客"
    category=field(data,"p_category",24)
    body=field(data,"p_body",1500)
    contact=field(data,"p_contact",200)
    title=field(data,"p_title",80)
    context=field(data,"p_context",300)
    private=data.get("p_private",False)
    if type(private) is not bool: raise Problem("请检查留言内容")
    screenshot=decode_screenshot(data.get("p_screenshot"))
    request_fields=[nick,category,body,contact,title,context,private]
    if screenshot: request_fields.append(hashlib.sha256(screenshot).hexdigest())
    request_hash=hashlib.sha256(json.dumps(request_fields,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()
    if category not in CATEGORIES or not 5<=len(body)<=1500:
        raise Problem("请检查留言内容和长度")
    if contact and not private and any(contact.casefold() in value.casefold() for value in (body,nick,title,context)):
        raise Problem("请勿在公开内容中填写联系方式")
    now=int(time.time())
    db.execute("BEGIN IMMEDIATE")
    try:
        existing=db.execute("SELECT owner_hash,visibility,request_hash FROM messages WHERE id=?",(mid,)).fetchone()
        if existing:
            if existing["owner_hash"]!=digest:
                raise Problem("无效的留言凭证")
            if existing["request_hash"] and not hmac.compare_digest(existing["request_hash"],request_hash):
                raise Problem("留言内容已变化，请重新提交",409)
            db.execute("COMMIT")
            return {"id":mid,"visibility":existing["visibility"]}
        if db.execute("SELECT COUNT(*) FROM messages WHERE owner_hash=? AND created_epoch>?",(digest,now-600)).fetchone()[0]>=3 or db.execute("SELECT COUNT(*) FROM messages WHERE created_epoch>?",(now-600,)).fetchone()[0]>=50:
            raise Problem("留言过于频繁，请稍后重试",429)
        if screenshot and db.execute("SELECT COALESCE(SUM(size),0) FROM attachments").fetchone()[0]+len(screenshot)>ATTACHMENT_TOTAL:
            raise Problem("截图存储已满，请移除截图后提交文字留言",507)
        record_write(db,digest,"submit",now,3,50)
        db.execute("INSERT INTO messages(id,owner_hash,nickname,category,body,created_at,created_epoch,title,context,private,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(mid,digest,nick,category,body,datetime.now(timezone.utc).isoformat(),now,title,context,int(private),request_hash))
        if contact:
            db.execute("INSERT INTO contacts(message_id,contact) VALUES(?,?)",(mid,contact))
        if screenshot:
            db.execute("INSERT INTO attachments(message_id,image,size) VALUES(?,?,?)",(mid,screenshot,len(screenshot)))
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
            return self.reply(200,{"ok":True,"version":2,"features":["edit","detail","progress-filter","admin-search","attachment","admin-counts","own-updates","admin-session","admin-devices","admin-filter-v2","public-page","report","admin-tools-v8"]})
        self.reply(404,{"message":"接口不存在"})
    def do_POST(self):
        try:
            if self.headers.get("Origin")!=ORIGIN:
                raise Problem("来源不允许",403)
            prefix="/api/guestbook/"
            if not self.path.startswith(prefix):
                raise Problem("接口不存在",404)
            action=self.path[len(prefix):]
            if action not in {"guestbook_submit","guestbook_public","guestbook_mine","guestbook_remove_contact","guestbook_withdraw","guestbook_vote","guestbook_votes","guestbook_admin_list","guestbook_admin_update","guestbook_admin_delete","guestbook_edit","guestbook_detail","guestbook_attachment","guestbook_remove_attachment","guestbook_admin_counts","guestbook_my_updates","guestbook_admin_login","guestbook_admin_logout","guestbook_admin_devices","guestbook_admin_revoke_others","guestbook_public_page","guestbook_report","guestbook_admin_maintenance","guestbook_admin_audit","guestbook_admin_export"}:
                raise Problem("接口不存在",404)
            if self.headers.get_content_type()!="application/json":
                raise Problem("请求格式错误",415)
            try:
                n=int(self.headers.get("Content-Length","0"))
            except ValueError:
                raise Problem("请求格式错误") from None
            limit=270000 if action=="guestbook_submit" else 16384
            if not 0<n<=limit:
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

class BoundedServer(ThreadingHTTPServer):
    daemon_threads=True
    slots=threading.BoundedSemaphore(32)
    def process_request(self,request,client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request,client_address)
        except BaseException:
            self.slots.release()
            raise
    def process_request_thread(self,request,client_address):
        try:
            super().process_request_thread(request,client_address)
        finally:
            self.slots.release()

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
        daily_backup()
        threading.Thread(target=backup_loop,daemon=True).start()
        BoundedServer((args.host,args.port),Handler).serve_forever()
    else:
        admin(args)
if __name__=="__main__":
    main()
