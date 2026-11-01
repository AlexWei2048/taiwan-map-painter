"""Create a current source archive from tracked files; no browser user data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', default=str(ROOT / 'release-source.zip'))
args = parser.parse_args()
output = Path(args.output).resolve()
files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(filter(None, files)):
        path = ROOT / name
        if path.is_file() and path.resolve() != output:
            archive.write(path, Path('taiwan-map-painter') / name)
print(output)
