"""Diagnostic only. Generator cameras never enter native reconstruction inputs."""
import numpy as np,json,sys
from pathlib import Path
j=json.load(open(sys.argv[1] if len(sys.argv)>1 else 'evidence/digitization/2bhk/targeted-camera-result.json'))['report'];src=json.load(open('evidence/digitization/2bhk/source-camera-diagnostic.json'));frames={f['artifactId']:f for f in json.load(open('evidence/digitization/2bhk/labelled-frame-diagnostic.json'))};sizes={int(l.split('|')[1]):l.split('|')[0] for l in Path('evidence/digitization/2bhk/source-sizes.txt').read_text().splitlines()};clips={sizes[p.stat().st_size]:int(p.stem.split('-')[1]) for p in Path('assets/digitization-2bhk').glob('part-*.mp4')};recovered=[];truth=[];indexes=[]
for pose in j['models'][0]['cameraPoses'].values():
 f=frames[Path(pose['name']).stem];index=clips[f['cameraGroupId']]*12+round(float(f['timestampSeconds']));w,x,y,z=pose['worldToCameraQuaternion'];r=np.array([[1-2*y*y-2*z*z,2*x*y-2*w*z,2*x*z+2*w*y],[2*x*y+2*w*z,1-2*x*x-2*z*z,2*y*z-2*w*x],[2*x*z-2*w*y,2*y*z+2*w*x,1-2*x*x-2*y*y]]);recovered.append(-r.T@pose['worldToCameraTranslation']);truth.append(src[index]['p']);indexes.append(index)
a=np.array(recovered);b=np.array(truth);ac=a-a.mean(0);bc=b-b.mean(0);u,d,v=np.linalg.svd(ac.T@bc);rot=u@v;scale=d.sum()/(ac**2).sum();err=np.linalg.norm(scale*ac@rot-bc,axis=1)
rows=[]
for clip in range(17):
 values=[float(e) for i,e in zip(indexes,err) if i//12==clip];rows.append({'clip':clip,'registered':len(values),'meanPositionError':float(np.mean(values)) if values else None,'maxPositionError':max(values) if values else None})
print(json.dumps({'label':'V','scope':'Synthetic source comparison only; no metric-property approval or source-camera reconstruction input','alignmentRms':float(np.sqrt(np.mean(err**2))),'clips':rows,'frames':[{'index':int(i),'error':float(e),'recovered':p.tolist()} for i,e,p in sorted(zip(indexes,err,a),key=lambda x:x[0]) if i//12 in (3,4,5)]},indent=2))
