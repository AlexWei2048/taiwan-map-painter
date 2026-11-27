"""Container launcher: fail closed unless a private persistent volume is mounted."""
import os
from pathlib import Path
import sys

mount = Path("/data")
if not mount.is_dir():
    raise SystemExit("Attach a persistent volume at /data before starting.")
# Linux mountinfo detects bind mounts even when they share the parent device.
with open("/proc/self/mountinfo", encoding="utf-8") as source:
    paths = {line.split()[4] for line in source if len(line.split()) > 4}
if str(mount) not in paths:
    raise SystemExit("No persistent /data volume; refusing to store messages on ephemeral disk.")
db = Path(os.environ.get("GUESTBOOK_DB", "/data/guestbook.sqlite3")).resolve()
if db.parent != mount or not db.name.endswith(".sqlite3"):
    raise SystemExit("GUESTBOOK_DB must be a .sqlite3 file directly inside /data.")
if os.geteuid() == 0:
    os.chown(mount, 10001, 10001)
    os.chmod(mount, 0o700)
    os.setgroups([])
    os.setgid(10001)
    os.setuid(10001)
if not os.access(mount, os.W_OK):
    raise SystemExit("Persistent /data volume is not writable by service user.")
os.umask(0o077)
os.environ["GUESTBOOK_DB"] = str(db)
os.execv(sys.executable, [sys.executable, "/app/server.py", "serve", "--host", "0.0.0.0"])
