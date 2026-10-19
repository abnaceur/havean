"""Read-only diagnostic: recovered camera centres grouped by uploaded RGB clip.
No generator geometry or poses are supplied to reconstruction.
"""
import json,math,sys
from pathlib import Path
report=json.loads(Path(sys.argv[1]).read_text())['report']
sizes={int(line.split('|')[1]):line.split('|')[0] for line in Path('evidence/digitization/2bhk/source-sizes.txt').read_text().splitlines()}
clips={sizes[p.stat().st_size]:int(p.stem.split('-')[1]) for p in Path('assets/digitization-2bhk').glob('part-*.mp4') if p.stat().st_size in sizes}
groups={str(g['colmapCameraId']):g['cameraGroupId'] for g in report['cameraGroupAssignments']}
output=[]
for model in report['models']:
 points={}
 for pose in model['cameraPoses'].values():
  w,x,y,z=pose['worldToCameraQuaternion']; t=pose['worldToCameraTranslation']
  r=[[1-2*y*y-2*z*z,2*x*y-2*w*z,2*x*z+2*w*y],[2*x*y+2*w*z,1-2*x*x-2*z*z,2*y*z-2*w*x],[2*x*z-2*w*y,2*y*z+2*w*x,1-2*x*x-2*y*y]]
  c=[-sum(r[j][i]*t[j] for j in range(3)) for i in range(3)]
  points.setdefault(clips.get(groups[pose['cameraId']],groups[pose['cameraId']]),[]).append(c)
 rows=[]
 for clip,values in sorted(points.items(),key=lambda p:str(p[0])):
  centre=[sum(p[i] for p in values)/len(values) for i in range(3)]
  rows.append({'clip':clip,'count':len(values),'centre':centre,'rmsRadius':math.sqrt(sum(sum((p[i]-centre[i])**2 for i in range(3)) for p in values)/len(values))})
 output.append({'model':model['model'],'registered':model['registeredCameraCount'],'points':model['pointCount'],'groups':rows})
print(json.dumps({'label':'V','basis':'Recovered unscaled cameras only; source clip identity from uploaded byte size','models':output},indent=2))
