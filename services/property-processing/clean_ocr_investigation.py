from pathlib import Path
import hashlib,json,shutil,re
root=Path('/usr/local/lib/python3.12/site-packages/paddle/libs');native=Path('/opt/ocr-models/native');pins=json.loads((native/'pins.json').read_text())['libraries']
profile=json.loads(Path('/tmp/ocr-investigation-build.json').read_text())
assert profile['enabled'] is False and pins==profile['nativeLibraries']
assert json.loads((native.parent/'pins.json').read_text())==profile['models']
for model,record in profile['models'].items():
 assert re.fullmatch(r'[A-Za-z0-9_.-]+',model)
 for filename,artifact in record['artifacts'].items():
  assert Path(filename).name==filename
  path=native.parent/model/filename
  assert not path.is_symlink() and path.is_file()
  assert hashlib.sha256(path.read_bytes()).hexdigest()==artifact['sha256']
for name,record in pins.items():
 assert re.fullmatch(r'[A-Za-z0-9_+.-]+\.so(?:\.[0-9]+)*',name) and not (native/name).is_symlink()
 assert hashlib.sha256((native/name).read_bytes()).hexdigest()==record['sha256'],name
 if name in ['libiomp5.so','libmklml_intel.so','libblas.so.3','liblapack.so.3']:shutil.copyfile(native/name,root/name)
for name in ['libgfortran.so.3','libquadmath.so.0']:
 path=root/name;assert path.is_file(),name;path.unlink()
for name in ['libiomp5.so','libmklml_intel.so','libblas.so.3','liblapack.so.3']:assert hashlib.sha256((root/name).read_bytes()).hexdigest()==pins[name]['sha256']
