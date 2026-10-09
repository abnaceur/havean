import {digitizationGeometryRevision} from '../../packages/contracts/src/digitization-geometry';
import {expect,it} from 'vitest';
import {roomTopologyError,triangulateDigitizationRoom} from '../../packages/contracts/src/digitization-topology';
const p=(x:number,y:number)=>({x,y});
const square=[p(0,0),p(10,0),p(10,10),p(0,10)];
it('triangulates concave L-shaped rooms without a triangle fan crossing the notch',()=>{
 const room=[p(0,0),p(5,0),p(5,2),p(2,2),p(2,5),p(0,5)],copy=JSON.stringify(room);
 const result=triangulateDigitizationRoom(room);expect(result.coordinateArea).toBe(16);expect(result.indices).toHaveLength(12);expect(JSON.stringify(room)).toBe(copy);
 for(let i=0;i<result.indices.length;i+=3){const triangle=result.indices.slice(i,i+3).map(id=>result.vertices[id]);const center={x:triangle.reduce((n,q)=>n+q.x,0)/3,y:triangle.reduce((n,q)=>n+q.y,0)/3};expect(center.x<=2||center.y<=2).toBe(true);}
});
it('triangulates a room with a courtyard hole, retaining area and excluding hole interiors',()=>{
 const hole=[p(3,3),p(7,3),p(7,7),p(3,7)],result=triangulateDigitizationRoom(square,[hole]);expect(result.coordinateArea).toBe(84);expect(result.vertices).toHaveLength(8);
 for(let i=0;i<result.indices.length;i+=3){const triangle=result.indices.slice(i,i+3).map(id=>result.vertices[id]);const x=triangle.reduce((n,q)=>n+q.x,0)/3,y=triangle.reduce((n,q)=>n+q.y,0)/3;expect(x>3&&x<7&&y>3&&y<7).toBe(false);}
 expect(triangulateDigitizationRoom([...square].reverse(),[[...hole].reverse()]).coordinateArea).toBe(84);
});
it('rejects crossed/degenerate rooms, boundary-touching, outside and overlapping holes',()=>{
 const hole=[p(2,2),p(5,2),p(5,5),p(2,5)],overlap=[p(4,4),p(6,4),p(6,6),p(4,6)];
 for(const [outer,holes] of [[ [p(0,0),p(10,10),p(10,0),p(0,10)],[] ],[[p(0,0),p(1,0),p(2,0)],[]],[square,[[p(0,2),p(3,2),p(3,4),p(0,4)]]],[square,[[p(11,2),p(13,2),p(13,4),p(11,4)]]],[square,[hole,overlap]]] as const){expect(roomTopologyError(outer,holes)).not.toBeNull();expect(()=>triangulateDigitizationRoom(outer,holes)).toThrow();}
});

it('v2 no-panorama concave/hole room validates without changing the legacy schema',()=>{
 const uuid='10000000-0000-4000-8000-000000000001',source={kind:'manual',actorId:uuid,note:'Agent trace from source'};
 const model={schemaVersion:2,id:uuid,organizationId:uuid,targetId:uuid,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'px',scaleStatus:'unscaled',sourceAssets:[],sources:[source],scaleAnchors:[],floors:[{id:'ground',name:'Ground',elevation:'0',height:null,source}],rooms:[{id:'room',floorId:'ground',name:'Courtyard room',type:'living',polygon:square,holes:[[p(3,3),p(7,3),p(7,7),p(3,7)]],panoramaSceneId:null,source,areaBasis:'geometry_room_net'}],walls:[],openings:[],stairs:[],review:{status:'pending',actorId:null}};
 expect(digitizationGeometryRevision.parse(model).rooms[0].panoramaSceneId).toBeNull();
 expect(digitizationGeometryRevision.safeParse({...model,rooms:[{...model.rooms[0],holes:[[p(0,0),p(2,0),p(2,2)]]}]}).success).toBe(false);
 expect(digitizationGeometryRevision.safeParse({...model,rooms:[{...model.rooms[0],holes:[],polygon:[p(0,0),p(5,0),p(5,2),p(2,2),p(2,5),p(0,5)]}]}).success).toBe(true);
});
