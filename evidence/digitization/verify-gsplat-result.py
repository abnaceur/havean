import hashlib,json,sys
from pathlib import Path
import torch
from PIL import Image
expected_steps=int(sys.argv[2]) if len(sys.argv)>2 else 500
root=Path(sys.argv[1]); report=json.loads((root/'training-report.json').read_text()); pointer=json.loads((root/'checkpoint.json').read_text())
checkpoint=root/pointer['file']; assert hashlib.sha256(checkpoint.read_bytes()).hexdigest()==pointer['sha256']
state=torch.load(checkpoint,map_location='cpu',weights_only=True)
assert report['state']=='awaiting_review' and report['iterations']==state['step']==pointer['step']==expected_steps
assert state['datasetFingerprint']==pointer['datasetFingerprint']==report['datasetFingerprint']
count=report['splatCount']; assert count>0 and state['parameters']['means'].shape==(count,3)
assert all(torch.isfinite(p).all().item() for p in state['parameters'].values())
artifacts=[]
for file in [root/'scene.ply',root/'viewer-tiers/mobile.splat',root/'viewer-tiers/desktop.splat',*sorted(root.glob('held-out-*.png'))]:
 body=file.read_bytes(); assert body
 if file.suffix=='.ply': assert ('element vertex '+str(count)+'\n').encode() in body[:1000]
 if file.suffix=='.splat': assert len(body)%32==0 and len(body)//32>0
 if file.suffix=='.png':
  with Image.open(file) as im: im.verify()
 artifacts.append({'name':str(file.relative_to(root)),'byteSize':len(body),'sha256':hashlib.sha256(body).hexdigest()})
print(json.dumps({'labels':['O','P','V'],'executionId':root.parent.name,'checkpointLoadable':True,'checkpointFile':checkpoint.name,'checkpointSha256':pointer['sha256'],'checkpointBytes':checkpoint.stat().st_size,'parameters':{k:list(v.shape) for k,v in state['parameters'].items()},'report':report,'artifacts':artifacts,'scope':sys.argv[3] if len(sys.argv)>3 else 'Actual local GPU reference-room run; no complete-property, scale, editable-object, public-review or production admission claim'},indent=2))
