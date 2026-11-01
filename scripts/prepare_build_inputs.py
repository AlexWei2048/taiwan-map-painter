"""Restore archived public build inputs without overwriting later audit files."""
from pathlib import Path
from zipfile import ZipFile
import hashlib

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'archive/build-inputs-20261030.zip'
EXPECTED = '3d66be8d5d67c4f3a7d3e7e0121e2d18cc83cd9cd6ca675e8e60144bb58dc7c5'
if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != EXPECTED:
    raise SystemExit('Build input archive checksum does not match')
count = 0
with ZipFile(ARCHIVE) as archive:
    for item in archive.infolist():
        marker = 'taiwan-map-painter/sources/'
        if not item.filename.startswith(marker) or item.is_dir():
            continue
        relative = Path(item.filename[len(marker):])
        if relative.is_absolute() or '..' in relative.parts:
            raise SystemExit('Invalid archive member')
        destination = ROOT / 'sources' / relative
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(archive.read(item))
        count += 1
print(f'Restored {count} public input files; existing audit records retained')
