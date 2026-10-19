"""Build-time pinned media source acquisition; never used by an execution."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--profile', required=True)
parser.add_argument('--directory', required=True)
args = parser.parse_args()
profile = json.loads(Path(args.profile).read_text())
if profile['version'] != '7.1.5' or profile['source'] != 'https://ffmpeg.org/releases/ffmpeg-7.1.5.tar.xz':
    raise ValueError('Unapproved media source')
directory = Path(args.directory)
directory.mkdir(parents=True, exist_ok=True)
target = directory/'ffmpeg-7.1.5.tar.xz'
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == profile['sourceSha256']:
    print('Verified cached FFmpeg 7.1.5 source')
else:
    with urllib.request.urlopen(profile['source'], timeout=60) as response:
        if response.url != profile['source']:
            raise ValueError('Unapproved media source redirect')
        content = response.read(20*1024*1024+1)
    if len(content) > 20*1024*1024 or hashlib.sha256(content).hexdigest() != profile['sourceSha256']:
        raise ValueError('Media source checksum/size mismatch')
    temporary = directory/('download-'+str(uuid.uuid4())+'.tmp')
    temporary.write_bytes(content)
    temporary.replace(target)
    print('Verified pinned FFmpeg 7.1.5 source download')
