"""Build-time wheel acquisition; never invoked by a processing execution."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("--manifest", required=True)
parser.add_argument("--directory", required=True)
args = parser.parse_args()
manifest = json.loads(Path(args.manifest).read_text())
directory = Path(args.directory)
directory.mkdir(parents=True, exist_ok=True)
for package in manifest["python"].values():
    for artifact in package["artifacts"]:
        name, digest, url = artifact["filename"], artifact["sha256"], artifact["url"]
        if not re.fullmatch(r"[A-Za-z0-9_.+-]+\.whl", name) or not re.fullmatch(r"[a-f0-9]{64}", digest) or not url.startswith("https://files.pythonhosted.org/"):
            raise ValueError("Invalid approved wheel artifact")
        file = directory / name
        if file.exists() and hashlib.sha256(file.read_bytes()).hexdigest() == digest:
            print("Verified cached", name, flush=True)
            continue
        with urllib.request.urlopen(url, timeout=60) as response:
            if not response.url.startswith("https://files.pythonhosted.org/"):
                raise ValueError("Unapproved wheel redirect")
            content = response.read(50 * 1024 * 1024 + 1)
        if len(content) > 50 * 1024 * 1024 or hashlib.sha256(content).hexdigest() != digest:
            raise ValueError("Wheel checksum/size mismatch")
        temporary = directory / (name + "." + str(uuid.uuid4()) + ".tmp")
        temporary.write_bytes(content)
        temporary.replace(file)
        print("Verified download", name, len(content), "bytes", flush=True)
